const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;
const CORE_ENGINE_URL = 'http://127.0.0.1:8081';

// Enable Cross-Origin Resource Sharing for decoupled network boundaries
app.use(cors());
app.use(express.json());

// AUTOMATED STATIC HOSTING: Serves your frontend workspace canvas natively over port 3000
app.use(express.static(__dirname));

console.log("========================================================================");
console.log("     INFINITY FINANCIALPRODUCTOS - CONSOLIDATED NODE PROXY GATEWAY      ");
console.log("========================================================================");

/**
 * PROXY ROUTE: ORCHESTRATION PIPELINE TRAFFIC DISTRIBUTOR
 * Intercepts inbound payload packets from the web UI canvas layer and 
 * pipes them directly down into our live Layer 4 FastAPI Execution Engine.
 */
app.post('/api/run-orchestrator', async (req, res) => {
    try {
        console.log(`\n[Node Proxy] Intercepted outbound UI execution request for scope: ${req.body.domain_scope || 'UNKNOWN'}`);
        
        // Hand off payload securely to port 8081 processing channels
        const coreResponse = await axios.post(
            `${CORE_ENGINE_URL}/api/v1/canvas/process-pipeline-lifecycle`, 
            req.body,
            { headers: { 'Content-Type': 'application/json' } }
        );
        
        console.log(`[Node Proxy] Core engine returned lifecycle state: ${coreResponse.data.pipeline_status}`);
        return res.status(200).json(coreResponse.data);
    } catch (error) {
        const errorDetails = error.response ? error.response.data : error.message;
        console.error(`\n[Fatal Proxy Error] Communication loop disconnected:`, errorDetails);
        return res.status(500).json({
            pipeline_status: "PROXY_GATEWAY_DISCONNECTED",
            message: "The Node proxy server was unable to contact the backend FastAPI core engine.",
            error_context: errorDetails
        });
    }
});

/**
 * ROOT STUDIO ACCELERATOR UI CAPTURE
 * Serves index.html directly over http://localhost:3000 to eliminate file schema anomalies.
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start listening for traffic on local port 3000
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Gateway Active] Proxy network is listening on http://localhost:${PORT}`);
    console.log(`[Target Anchor] Routing all traffic directly to Core Engine: ${CORE_ENGINE_URL}`);
    console.log("========================================================================");
});