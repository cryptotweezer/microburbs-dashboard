let currentData = {};

function showError(message) {
    const errorEl = document.getElementById('error');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
}

function getSelectedEndpoints() {
    const checkboxes = document.querySelectorAll('.checkbox-grid input:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

async function loadData() {
    hideError();
    const suburb = document.getElementById('suburb').value;
    const endpoints = getSelectedEndpoints();
    
    if (!suburb) {
        showError('Please enter a suburb name');
        return;
    }
    
    if (endpoints.length === 0) {
        showError('Please select at least one data module');
        return;
    }
    
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').innerHTML = '';
    
    try {
        const url = `/api/data?suburb=${encodeURIComponent(suburb)}&endpoints=${endpoints.join(',')}&property_type=house`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        currentData = await response.json();
        renderData();
    } catch (error) {
        showError('Error loading data: ' + error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function renderData() {
    const content = document.getElementById('content');
    content.innerHTML = '';
    
    if (currentData.properties) renderProperties();
    if (currentData.market) renderMarket();
    if (currentData.demographics) renderDemographics();
    if (currentData.schools) renderSchools();
    if (currentData.amenity) renderAmenities();
    if (currentData.risk) renderRisk();
    if (currentData.summary) renderSummary();
}

function renderProperties() {
    const section = createSection('Property Listings');
    const data = currentData.properties;
    
    if (!data.properties || data.properties.length === 0) {
        section.innerHTML += '<p>No properties found</p>';
        return;
    }
    
    const insights = `
        <div class="insights">
            <div class="insight-card">
                <div class="insight-label">Total Listings</div>
                <div class="insight-value">${data.insights.total}</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Average Price</div>
                <div class="insight-value">$${data.insights.avg_price.toLocaleString()}</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Average Land Size</div>
                <div class="insight-value">${data.insights.avg_land_size.toLocaleString()} m²</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Price per m²</div>
                <div class="insight-value">$${data.insights.price_per_sqm.toLocaleString()}</div>
            </div>
        </div>
        <div style="margin: 20px 0; text-align: right;">
            <button class="btn-export" onclick="exportPropertiesCSV()">📊 Export to CSV</button>
        </div>
    `;
    
    const table = `
        <table>
            <thead>
                <tr>
                    <th onclick="sortProperties('address')">Address ⇅</th>
                    <th onclick="sortProperties('price')">Price ⇅</th>
                    <th onclick="sortProperties('bedrooms')">Beds ⇅</th>
                    <th onclick="sortProperties('bathrooms')">Baths ⇅</th>
                    <th onclick="sortProperties('land_size')">Land Size ⇅</th>
                    <th>Listing Date</th>
                </tr>
            </thead>
            <tbody>
                ${data.properties.map(p => `
                    <tr>
                        <td style="font-weight: 500;">${p.area_name || 'N/A'}</td>
                        <td style="color: var(--primary); font-weight: 600;">$${(p.price || 0).toLocaleString()}</td>
                        <td>${Math.round(p.attributes?.bedrooms || 0)}</td>
                        <td>${Math.round(p.attributes?.bathrooms || 0)}</td>
                        <td>${p.attributes?.land_size || 'N/A'}</td>
                        <td style="font-size: 13px;">${p.listing_date || 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    section.innerHTML += insights + table;
}

let sortDirection = {};

function sortProperties(column) {
    const data = currentData.properties;
    if (!data || !data.properties) return;
    
    const direction = sortDirection[column] === 'asc' ? 'desc' : 'asc';
    sortDirection[column] = direction;
    
    const sorted = [...data.properties].sort((a, b) => {
        let aVal, bVal;
        
        if (column === 'address') {
            aVal = a.area_name || '';
            bVal = b.area_name || '';
        } else if (column === 'price') {
            aVal = a.price || 0;
            bVal = b.price || 0;
        } else if (column === 'land_size') {
            const aLand = a.attributes?.land_size;
            const bLand = b.attributes?.land_size;
            aVal = typeof aLand === 'string' ? parseInt(aLand) || 0 : aLand || 0;
            bVal = typeof bLand === 'string' ? parseInt(bLand) || 0 : bLand || 0;
        } else {
            aVal = a.attributes?.[column] || 0;
            bVal = b.attributes?.[column] || 0;
        }
        
        if (direction === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
    
    currentData.properties.properties = sorted;
    renderProperties();
}

function exportPropertiesCSV() {
    const data = currentData.properties;
    if (!data || !data.properties || data.properties.length === 0) {
        alert('No properties to export');
        return;
    }
    
    let csv = 'Address,Price,Bedrooms,Bathrooms,Land Size,Listing Date,Property Type\n';
    
    data.properties.forEach(p => {
        const row = [
            `"${p.area_name || ''}"`,
            p.price || 0,
            Math.round(p.attributes?.bedrooms || 0),
            Math.round(p.attributes?.bathrooms || 0),
            `"${p.attributes?.land_size || 'N/A'}"`,
            p.listing_date || 'N/A',
            p.property_type || 'N/A'
        ];
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `microburbs_properties_${document.getElementById('suburb').value}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function renderMarket() {
    const section = createSection('Market Insights');
    const data = currentData.market;
    
    if (!data.recent_trends || data.recent_trends.length === 0) {
        section.innerHTML += '<p>No market data available</p>';
        return;
    }
    
    const latest = data.recent_trends[0];
    const oldest = data.recent_trends[data.recent_trends.length - 1];
    const growth = ((latest.value - oldest.value) / oldest.value * 100).toFixed(1);
    const changeColor = growth >= 0 ? 'var(--success)' : 'var(--danger)';
    
    const insights = `
        <div class="insights">
            <div class="insight-card">
                <div class="insight-label">Latest Median Price</div>
                <div class="insight-value">$${Math.round(latest.value).toLocaleString()}</div>
            </div>
            <div class="insight-card" style="background: linear-gradient(135deg, ${growth >= 0 ? '#10B981' : '#EF4444'} 0%, ${growth >= 0 ? '#059669' : '#DC2626'} 100%);">
                <div class="insight-label">Growth (${data.recent_trends.length} periods)</div>
                <div class="insight-value">${growth}%</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Latest Period</div>
                <div class="insight-value" style="font-size: 18px;">${latest.date}</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Regional Price</div>
                <div class="insight-value">$${Math.round(latest.sa3.value).toLocaleString()}</div>
            </div>
        </div>
    `;
    
    const table = `
        <table>
            <thead>
                <tr><th>Period</th><th>Suburb Price</th><th>Regional Price</th><th>Difference</th><th>Change</th></tr>
            </thead>
            <tbody>
                ${data.recent_trends.map((t, i) => {
                    const diff = ((t.value - t.sa3.value) / t.sa3.value * 100).toFixed(1);
                    const prevValue = data.recent_trends[i + 1]?.value;
                    const change = prevValue ? (((t.value - prevValue) / prevValue * 100).toFixed(1)) : '-';
                    return `
                        <tr>
                            <td style="font-weight: 500;">${t.date}</td>
                            <td style="font-weight: 600;">$${Math.round(t.value).toLocaleString()}</td>
                            <td>$${Math.round(t.sa3.value).toLocaleString()}</td>
                            <td style="color: ${diff > 0 ? 'var(--success)' : 'var(--danger)'};">${diff}%</td>
                            <td style="color: ${change !== '-' && parseFloat(change) >= 0 ? 'var(--success)' : 'var(--danger)'};">${change !== '-' ? change + '%' : '-'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
    
    section.innerHTML += insights + table;
}

function renderDemographics() {
    const section = createSection('Demographics');
    const data = currentData.demographics;
    
    if (!data.age_brackets || data.age_brackets.length === 0) {
        section.innerHTML += '<p>No demographic data available</p>';
        return;
    }
    
    const chartHtml = data.age_brackets.map(age => {
        const percent = (age.proportion * 100).toFixed(1);
        return `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <span style="font-weight: 600; font-size: 14px;">${age.age} years</span>
                    <span style="color: var(--text-light); font-weight: 600;">${percent}%</span>
                </div>
                <div style="background: var(--border); height: 35px; border-radius: 8px; overflow: hidden;">
                    <div style="background: linear-gradient(90deg, var(--primary), var(--primary-dark)); height: 100%; width: ${percent}%; display: flex; align-items: center; padding-left: 15px; color: white; font-weight: 600; font-size: 13px; transition: width 0.5s;">
                        ${percent}%
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    section.innerHTML += chartHtml;
}

function renderSchools() {
    const section = createSection('Schools');
    const data = currentData.schools;
    
    if (!data.schools || data.schools.length === 0) {
        section.innerHTML += '<p>No schools found</p>';
        return;
    }
    
    const publicSchools = data.schools.filter(s => s.school_sector_type === 'Public').length;
    const privateSchools = data.schools.filter(s => s.school_sector_type === 'Private').length;
    
    const insights = `
        <div class="insights">
            <div class="insight-card">
                <div class="insight-label">Total Schools</div>
                <div class="insight-value">${data.total}</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Public Schools</div>
                <div class="insight-value">${publicSchools}</div>
            </div>
            <div class="insight-card">
                <div class="insight-label">Private Schools</div>
                <div class="insight-value">${privateSchools}</div>
            </div>
        </div>
    `;
    
    const table = `
        <table>
            <thead>
                <tr><th>School Name</th><th>Type</th><th>Level</th><th>NAPLAN</th><th>Attendance</th><th>Students</th></tr>
            </thead>
            <tbody>
                ${data.schools.map(s => `
                    <tr>
                        <td style="font-weight: 500;">${s.name}</td>
                        <td><span style="background: ${s.school_sector_type === 'Public' ? '#DBEAFE' : '#FCE7F3'}; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">${s.school_sector_type}</span></td>
                        <td>${s.school_level_type}</td>
                        <td>${s.naplan_rank || 'N/A'}</td>
                        <td>${s.attendance_rate ? (s.attendance_rate * 100).toFixed(0) + '%' : 'N/A'}</td>
                        <td>${Math.round((s.boys || 0) + (s.girls || 0))}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    section.innerHTML += insights + table;
}

function renderAmenities() {
    const section = createSection('Local Amenities');
    const data = currentData.amenity;
    
    if (!data.categories) {
        section.innerHTML += '<p>No amenity data available</p>';
        return;
    }
    
    const grid = `
        <div class="insights">
            <div class="insight-card">
                <div class="insight-label">Total Amenities</div>
                <div class="insight-value">${data.total}</div>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 20px;">
            ${Object.entries(data.categories).sort((a, b) => b[1] - a[1]).map(([cat, count]) => `
                <div style="background: var(--secondary); padding: 20px; border-radius: 10px; text-align: center; border-left: 4px solid var(--primary); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    <div style="font-size: 28px; font-weight: 700; color: var(--primary); margin-bottom: 5px;">${count}</div>
                    <div style="font-size: 13px; color: var(--text-light); font-weight: 600;">${cat}</div>
                </div>
            `).join('')}
        </div>
    `;
    
    section.innerHTML += grid;
}

function renderRisk() {
    const section = createSection('Risk Factors');
    const data = currentData.risk;
    
    if (!data.risks || Object.keys(data.risks).length === 0) {
        section.innerHTML += '<p>No significant risk factors identified</p>';
        return;
    }
    
    const riskHtml = Object.entries(data.risks).map(([name, values]) => `
        <div style="background: var(--secondary); padding: 20px; border-radius: 10px; margin-bottom: 15px; border-left: 4px solid var(--primary);">
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 8px; color: var(--text);">${name}</div>
            <div style="color: var(--text-light); font-size: 14px;">${values.filter(v => v).join(', ')}</div>
        </div>
    `).join('');
    
    section.innerHTML += riskHtml;
}

function renderSummary() {
    const section = createSection('Area Summary Scores');
    const data = currentData.summary;
    
    if (!data.scores || data.scores.length === 0) {
        section.innerHTML += '<p>No summary data available</p>';
        return;
    }
    
    const scoresHtml = data.scores.map(score => {
        const scoreValue = parseInt(score.value);
        const scoreColor = scoreValue >= 70 ? 'var(--success)' : scoreValue >= 50 ? '#F59E0B' : 'var(--danger)';
        
        return `
            <div style="background: var(--secondary); padding: 25px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid ${scoreColor};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="font-weight: 700; font-size: 18px;">${score.name}</div>
                    <div style="font-size: 32px; color: ${scoreColor}; font-weight: 700;">${score.value}</div>
                </div>
                <div style="color: var(--text-light); font-size: 14px; margin-bottom: 8px; font-style: italic;">${score.comment}</div>
                ${score.summary ? `<div style="font-size: 13px; color: var(--text); line-height: 1.6;">${score.summary[0]}</div>` : ''}
            </div>
        `;
    }).join('');
    
    section.innerHTML += scoresHtml;
}

function createSection(title) {
    const content = document.getElementById('content');
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = `<h2 class="section-title">${title}</h2>`;
    content.appendChild(section);
    return section;
}

// ============================================
// DUKE CHAT FUNCTIONALITY
// ============================================

let chatMinimized = false;
let chatMessages = [];

function initChat() {
    const chatWidget = document.createElement('div');
    chatWidget.className = 'chat-widget';
    chatWidget.id = 'chatWidget';
    chatWidget.innerHTML = `
        <div class="chat-header" onclick="toggleChat()">
            <div>
                <h3>🏠 Ask Duke - Your Property Expert</h3>
                <p style="margin: 0; font-size: 12px; opacity: 0.9;">Powered by Microburbs AI</p>
            </div>
            <button class="chat-toggle" id="chatToggle">−</button>
        </div>
        <div class="chat-body" id="chatBody">
            <div class="chat-messages" id="chatMessages">
                <div class="chat-message duke">
                    <div class="chat-avatar">
                        <img src="/static/duke.png" alt="Duke" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
                    </div>
                    <div class="chat-bubble">
                        G'day! I'm Duke, your Microburbs property expert. Ask me anything about the data on this dashboard - market trends, property insights, or suburb analysis. How can I assist you today?
                    </div>
                </div>
            </div>
        </div>
        <div class="chat-input-container">
            <input 
                type="text" 
                class="chat-input" 
                id="chatInput" 
                placeholder="Ask about properties, market trends, schools..."
                onkeypress="handleChatKeypress(event)"
            />
            <button class="chat-send" id="chatSend" onclick="sendChatMessage()">Send</button>
        </div>
    `;
    
    document.body.appendChild(chatWidget);
}

function toggleChat() {
    const widget = document.getElementById('chatWidget');
    const toggle = document.getElementById('chatToggle');
    chatMinimized = !chatMinimized;
    
    if (chatMinimized) {
        widget.classList.add('minimized');
        toggle.textContent = '+';
    } else {
        widget.classList.remove('minimized');
        toggle.textContent = '−';
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSend');
    const message = input.value.trim();
    
    if (!message) return;
    
    addChatMessage('user', message);
    input.value = '';
    sendBtn.disabled = true;
    
    showTypingIndicator();
    
    try {
        const context = prepareContextForDuke();
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                context: context
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get response from Duke');
        }
        
        const data = await response.json();
        
        removeTypingIndicator();
        addChatMessage('duke', data.response);
        
    } catch (error) {
        removeTypingIndicator();
        addChatMessage('duke', "I apologize, but I'm having trouble processing your request at the moment. Please try again in a moment.");
        console.error('Chat error:', error);
    } finally {
        sendBtn.disabled = false;
    }
}

function addChatMessage(sender, text) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    let avatarContent;
    if (sender === 'user') {
        avatarContent = '👤';
    } else {
        avatarContent = '<img src="/static/duke.png" alt="Duke" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">';
    }
    
    messageDiv.innerHTML = `
        <div class="chat-avatar">${avatarContent}</div>
        <div class="chat-bubble">${text}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message duke';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="chat-avatar">
            <img src="/static/duke.png" alt="Duke" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
        </div>
        <div class="chat-bubble">
            <div class="chat-typing">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

function prepareContextForDuke() {
    const context = {
        suburb: document.getElementById('suburb').value
    };
    
    if (currentData.properties) {
        const props = currentData.properties;
        
        // Build detailed property list for Duke
        const propertyDetails = (props.properties || []).map(p => {
            return {
                address: p.area_name,
                price: p.price,
                bedrooms: Math.round(p.attributes?.bedrooms || 0),
                bathrooms: Math.round(p.attributes?.bathrooms || 0),
                land_size: p.attributes?.land_size,
                listing_date: p.listing_date,
                property_type: p.property_type
            };
        });
        
        context.properties = {
            total: props.insights?.total || 0,
            avg_price: props.insights?.avg_price || 0,
            avg_land_size: props.insights?.avg_land_size || 0,
            price_per_sqm: props.insights?.price_per_sqm || 0,
            listings: propertyDetails
        };
    }
    
    if (currentData.market && currentData.market.recent_trends) {
        const trends = currentData.market.recent_trends;
        if (trends.length > 0) {
            const latest = trends[0];
            const oldest = trends[trends.length - 1];
            const growth = ((latest.value - oldest.value) / oldest.value * 100).toFixed(1);
            
            context.market = {
                latest_price: latest.value,
                growth: growth + '%',
                periods: trends.length,
                recent_data: trends.slice(0, 3).map(t => ({
                    date: t.date,
                    price: Math.round(t.value)
                }))
            };
        }
    }
    
    if (currentData.schools) {
        const schools = currentData.schools.schools || [];
        context.schools = {
            total: schools.length,
            public: schools.filter(s => s.school_sector_type === 'Public').length,
            private: schools.filter(s => s.school_sector_type === 'Private').length,
            list: schools.slice(0, 5).map(s => ({
                name: s.name,
                type: s.school_sector_type,
                level: s.school_level_type,
                naplan: s.naplan_rank
            }))
        };
    }
    
    if (currentData.demographics && currentData.demographics.age_brackets) {
        const ages = currentData.demographics.age_brackets;
        context.demographics = {
            age_distribution: ages.map(a => ({
                age_range: a.age,
                percentage: (a.proportion * 100).toFixed(1)
            }))
        };
    }
    
    if (currentData.amenity) {
        const topCategories = Object.entries(currentData.amenity.categories || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        context.amenities = {
            total: currentData.amenity.total || 0,
            top_categories: topCategories.map(([cat, count]) => ({
                category: cat,
                count: count
            }))
        };
    }
    
    if (currentData.summary && currentData.summary.scores) {
        context.summary = {
            scores: currentData.summary.scores.slice(0, 3).map(s => ({
                name: s.name,
                value: s.value,
                comment: s.comment
            }))
        };
    }
    
    return context;
}

window.onload = () => {
    loadData();
    setTimeout(initChat, 500);
};