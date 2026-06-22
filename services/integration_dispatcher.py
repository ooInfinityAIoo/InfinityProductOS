import time
import httpx
from typing import Dict, Any, List, Optional, Tuple

import models
from services.redis_middleware import redis_client, rate_limit_script
from services.data_masking import DataMaskingService

class IntegrationDispatcher:
    """
    LAYER 4: UNIFIED INTEGRATION DISPATCHER
    A dedicated utility to handle outbound API calls with enterprise resiliency patterns:
    Circuit Breakers, Token Bucket Rate Limiting, and automated PII Masking.
    """
    def __init__(self, api_configs_by_id: Dict[str, models.ApiConfiguration],
                 api_configs_by_name: Dict[str, models.ApiConfiguration] = None):
        self.api_configs_by_id = api_configs_by_id
        # Name-keyed secondary index: lets workflow steps reference APIs by api_name when
        # api_id is not known at authoring time (e.g. steps authored before the API was seeded).
        self.api_configs_by_name = api_configs_by_name or {}

    def execute_api_call(
        self,
        api_id: str,
        context: Dict[str, Any],
        masking_service: Optional[DataMaskingService] = None,
        pii_field_properties: Optional[Dict[str, Dict[str, str]]] = None
    ) -> Tuple[bool, List[str], List[Dict[str, Any]]]:
        """
        Executes an API call safely. 
        Returns a tuple containing: (success_boolean, list_of_logs, list_of_generated_events).
        """
        logs = []
        generated_events = []
        
        # Try primary lookup by api_id, then fall back to api_name.
        # This lets nodes reference an API by either its UUID (preferred) or its human name.
        api_config = self.api_configs_by_id.get(api_id) or self.api_configs_by_name.get(api_id)
        if not api_config:
            logs.append(f"[WARN] API trigger '{api_id}' not found by id or name in API registry. Skipping.")
            return False, logs, generated_events

        # Layer 6 Guardrail: PII Leakage Prevention for External API Calls.
        if pii_field_properties:
            pii_in_url = [field for field in pii_field_properties if f"{{{field}}}" in api_config.url_template]
            if pii_in_url:
                raise ValueError(f"Misconfigured API trigger '{api_config.api_name}': URL cannot contain PII fields: {pii_in_url}.")

        logs.append(f"Executing API Trigger: '{api_config.api_name}'")
        
        # --- CIRCUIT BREAKER: Evaluate State ---
        cb_state_key = f"api_circuit_breaker:state:{api_id}"
        cb_fails_key = f"api_circuit_breaker:fails:{api_id}"

        if redis_client:
            if redis_client.get(cb_state_key) == b"OPEN":
                logs.append(f"[CIRCUIT BREAKER OPEN] API '{api_config.api_name}' is currently unavailable. Request halted to prevent thread starvation.")
                return False, logs, generated_events

        # Resiliency Gate: Retry Logic with Exponential Back-off
        max_retries, backoff_factor, initial_delay = 3, 2, 1
        last_exception = None

        for attempt in range(max_retries):
            try:
                # --- RATE LIMITING: Token Bucket Check ---
                if rate_limit_script:
                    rate_limit_key = f"api_rate_limit:bucket:{api_id}"
                    current_time = time.time()
                    
                    is_allowed = rate_limit_script(keys=[rate_limit_key], args=[api_config.rate_limit_rps, current_time])
                    if not is_allowed:
                        logs.append(f"[RATE LIMIT] Token bucket empty for '{api_config.api_name}'. Throttling request.")
                        time.sleep(1.0) # Local thread throttle penalty
                        raise httpx.RequestError(f"Rate limit exceeded for {api_config.api_name}", request=None)

                # Layer 6 Guardrail: Enforce PII masking for outgoing request bodies.
                body_context = context
                if api_config.http_method.upper() in ['POST', 'PUT'] and api_config.mask_pii_in_body and masking_service and pii_field_properties:
                    logs.append(f"Applying PII masking to request body for API trigger '{api_config.api_name}'.")
                    body_context = masking_service.mask_pii_data(context, pii_field_properties)

                url = api_config.url_template.format(**context)
                
                with httpx.Client(timeout=10.0) as client:
                    if api_config.http_method.upper() == 'GET':
                        response = client.get(url)
                    elif api_config.http_method.upper() in ['POST', 'PUT']:
                        request_body = {k: body_context.get(v.strip('{}')) for k, v in api_config.request_body_template.items()} if api_config.request_body_template else None
                        response = client.post(url, json=request_body)
                    else:
                        logs.append(f"[WARN] Unsupported HTTP method '{api_config.http_method}' for API trigger '{api_id}'. Skipping.")
                        return False, logs, generated_events
                
                response.raise_for_status()
                if 'api_responses' not in context: context['api_responses'] = {}
                context['api_responses'][api_config.api_name] = response.json()
                
                generated_events.append({"event_type": "API_CALL_SUCCESS", "payload": {"api_id": api_id, "api_name": api_config.api_name, "status_code": response.status_code}})
                if redis_client: redis_client.delete(cb_fails_key)
                logs.append(f"API call to '{url}' successful. Response merged into context.")
                return True, logs, generated_events

            except httpx.RequestError as e:
                last_exception = e
                logs.append(f"[WARN] API call attempt {attempt + 1}/{max_retries} failed for '{api_config.api_name}': {e.__class__.__name__}")
                if redis_client:
                    fails = redis_client.incr(cb_fails_key)
                    if fails >= api_config.circuit_breaker_threshold:
                        redis_client.setex(cb_state_key, api_config.circuit_breaker_timeout_sec, "OPEN")
                        redis_client.delete(cb_fails_key)
                        logs.append(f"[CIRCUIT BREAKER TRIPPED] '{api_config.api_name}' failed {fails} times consecutively. Circuit is now OPEN for {api_config.circuit_breaker_timeout_sec} seconds.")
                if attempt + 1 < max_retries: time.sleep(initial_delay * (backoff_factor ** attempt))
            except (KeyError, Exception) as e:
                raise ValueError(f"Non-retriable error during API trigger '{api_config.api_name}': {str(e)}")
        
        if last_exception: logs.append(f"[ERROR] API call for '{api_config.api_name}' failed after all retries.")
        return False, logs, generated_events