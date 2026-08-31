let courseData = [];

// Load the JSON-LD file
fetch('data.json')
    .then(response => response.json())
    .then(data => {
        // Point directly to the array inside the @graph structure
        courseData = data["@graph"] || []; 
    })
    .catch(error => console.error("Error loading JSON-LD:", error));

function searchCourses() {
    const query = document.getElementById('searchBox').value.toLowerCase();
    const resultsContainer = document.getElementById('results');
    
    resultsContainer.innerHTML = '';

    // Enforce your data's rule: "You will need to use three or more letters in a search"
    if (query.length < 3) {
        if(query.length > 0) {
            resultsContainer.innerHTML = '<li>Please enter 3 or more characters...</li>';
        }
        return;
    }

    // Filter through the graph array
    const filteredCourses = courseData.filter(course => {
        // Search by Name
        const matchName = course.name?.toLowerCase().includes(query);
        
        // Search by Description
        const matchDesc = course.description?.toLowerCase().includes(query);
        
        // Search through the Keywords array
        const matchKeywords = course.keywords?.some(keyword => 
            keyword.toLowerCase().includes(query)
        );

        return matchName || matchDesc || matchKeywords;
    });

    // Render results
    if (filteredCourses.length === 0) {
        resultsContainer.innerHTML = '<li>No courses found</li>';
        return;
    }

    filteredCourses.forEach(course => {
        const li = document.createElement('li');
        li.style.marginBottom = "15px";
        li.innerHTML = `
            <strong>${course.name}</strong> (${course.discipline})<br>
            <small><em>Keywords: ${course.keywords.join(', ')}</em></small><br>
            <p>${course.description}</p>
        `;
        resultsContainer.appendChild(li);
    });
}
