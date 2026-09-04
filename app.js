// Automatically fetch the dynamic sidecar file built by Jekyll
fetch('./metadata.json')
  .then(response => {
    if (!response.ok) {
      throw new Error(`Failed to load sidecar metadata: ${response.status}`);
    }
    return response.json();
  })
  .then(modulesList => {
    const searchBox = document.getElementById('search-box');
    const resultsPanel = document.getElementById('results-panel');

    function executeFilterAndRender() {
      const query = searchBox.value.toLowerCase().trim();
      let filteredArray = [...modulesList];

      if (!query) {
        // --- 1. DEFAULT VIEW ---
        // Sort alphabetically by Track group, then chronologically by Sequence number
        filteredArray.sort((a, b) => {
          const trackA = String(a.track || "");
          const trackB = String(b.track || "");
          return trackA.localeCompare(trackB) || (Number(a.sequence || 0) - Number(b.sequence || 0));
        });
      } else {
        // --- 2. ACTIVE SEARCH VIEW ---
        // Basic filtering based on match characteristics
        filteredArray = filteredArray.filter(item => {
          const headlineMatch = String(item.headline || "").toLowerCase().includes(query);
          const trackMatch = String(item.track || "").toLowerCase().includes(query);
          const abstractMatch = String(item.abstract || "").toLowerCase().includes(query);
          return headlineMatch || trackMatch || abstractMatch;
        });
      }

      // --- 3. TEMPLATE ACCUMULATOR ---
      // Loop over your items and compile them into a single presentation string variable
      const htmlOutput = filteredArray.map(item => `
        <div class="schema-card" style="background: #ffffff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02); font-family: system-ui, sans-serif;">
          <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; background: #eef2f7; color: #475569; padding: 3px 8px; border-radius: 4px; font-weight: bold;">
            ${item.track || "Unassigned Track"} (Seq: ${item.sequence || "0"})
          </span>
          <h2 style="margin: 10px 0 5px 0; font-size: 20px;">
            <a href="${item.url}" style="color: #0284c7; text-decoration: none;">${item.headline}</a>
          </h2>
          <p style="color: #475569; margin: 0; font-size: 14px; line-height: 1.5;">${item.abstract || "No summary provided."}</p>
        </div>
      `).join('');

      // Inject the compiled HTML variable into the homepage panel DOM
      resultsPanel.innerHTML = htmlOutput || `<p style="color: #64748b; font-style: italic;">No modules found matching your search term.</p>`;
    }

    // Attach listener for real-time tracking, then trigger the default catalog sort instantly
    searchBox.addEventListener('input', executeFilterAndRender);
    executeFilterAndRender();
  })
  .catch(error => {
    console.error("Jekyll sidecar initialization failure:", error);
    document.getElementById('results-panel').innerHTML = `
      <p style="color: #ef4444; font-weight: bold;">Error loading catalog metadata payload.</p>
    `;
  });
