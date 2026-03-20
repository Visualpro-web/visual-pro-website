const fetch = require('node-fetch'); // Ensure node-fetch is available, or use native fetch if Node 18+

async function runTest() {
    console.log("1. Fetching projects...");
    const res = await fetch('http://localhost:3000/api/admin/projects', {
        headers: { 'Authorization': 'Bearer 01270101' }
    });
    const projects = await res.json();
    console.log("Total projects:", projects.length);
    
    if (projects.length === 0) {
        console.log("No projects found. Cannot test advanceStep.");
        return;
    }
    
    const p = projects[0];
    console.log(`2. Project [${p.id}] status is: ${p.status}`);
    
    const nextStep = 'Request Under Review';
    console.log(`3. Moving to: ${nextStep}...`);
    
    const patchRes = await fetch(`http://localhost:3000/api/admin/projects/${p.id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer 01270101'
        },
        body: JSON.stringify({ status: nextStep })
    });
    
    if (patchRes.ok) {
        const data = await patchRes.json();
        console.log("✅ PATCH SUCCESS!");
        console.log("Returned project status:", data.project.status);
    } else {
        console.error("❌ PATCH FAILED:", patchRes.status);
        console.log(await patchRes.text());
    }
}

runTest();
