import os
import redis

# --- LAYER 4 INTEGRATION MIDDLEWARE ---
# Initialize a connection pool to Redis for distributed orchestration state
REDIS_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
try:
    redis_client = redis.from_url(REDIS_URL)
    # Pre-load the Lua script into the Redis cache for extreme performance (EVALSHA)
    RATE_LIMIT_LUA_SCRIPT = """
    local key = KEYS[1]
    local rate = tonumber(ARGV[1])
    local now = tonumber(ARGV[2])
    
    local tokens = tonumber(redis.call('HGET', key, 'tokens'))
    local last_time = tonumber(redis.call('HGET', key, 'time'))
    
    if tokens == nil then tokens = rate end
    if last_time == nil then last_time = now end
    
    local elapsed = math.max(0, now - last_time)
    tokens = math.min(rate, tokens + (elapsed * rate))
    
    if tokens >= 1 then
        redis.call('HSET', key, 'tokens', tokens - 1, 'time', now)
        redis.call('EXPIRE', key, math.ceil(1/rate) * 2 + 2)
        return 1
    else
        return 0
    end
    """
    rate_limit_script = redis_client.register_script(RATE_LIMIT_LUA_SCRIPT)
except Exception as e:
    redis_client = rate_limit_script = None