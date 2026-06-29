/**
 * EDUTUBE ENGINE v1.0
 * Strict Educational Video Platform powered by YouTube Data API v3
 */

const API_KEY = "AIzaSyAFLZ9UrovDqT8iNae6tdGvTappNtbai4I"; // <--- PASTE YOUR KEY HERE

const SUBJECT_POOL = [
    "Quantum Physics lecture", "Organic Chemistry university course", "Calculus 3 MIT tutorial", 
    "Data Structures Algorithms Java course", "Machine Learning Stanford", "Molecular Biology explained",
    "Microeconomics university lecture", "Astrophysics course", "Biochemistry tutorial", 
    "Linear Algebra 3Blue1Brown", "Genetics CRISPR lecture", "Game Theory Yale course"
];

class EduTubeApp {
    constructor() {
        this.cache = new Map();
        this.nextPageToken = '';
        this.currentQuery = '';
        this.isLoading = false;
        this.activeVideo = null;
        
        this.bookmarks = JSON.parse(localStorage.getItem('edu_bookmarks')) || [];
        this.history = JSON.parse(localStorage.getItem('edu_history')) || [];

        this.initListeners();
        this.loadHome();
    }

    initListeners() {
        // Theme
        document.getElementById('theme-toggle').onclick = () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            document.querySelector('#theme-toggle i').className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
        };

        // Sidebar mobile
        document.getElementById('sidebar-toggle').onclick = () => {
            document.getElementById('sidebar').classList.toggle('open');
        };

        // Search trigger
        const searchInput = document.getElementById('search-input');
        document.getElementById('search-btn').onclick = () => this.search(searchInput.value);
        searchInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.search(searchInput.value));

        // Live Suggestions
        searchInput.addEventListener('input', (e) => this.handleSuggestions(e.target.value));

        // Infinite Scroll Observer
        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !this.isLoading && this.nextPageToken) {
                this.fetchAndAppend();
            }
        }, { threshold: 0.1 });
        this.observer.observe(document.getElementById('infinite-sentinel'));
    }

    /* --- API ENGINE --- */

    async executeEducationalFetch(rawQuery, pageToken = '') {
        const cacheKey = `${rawQuery}_${pageToken}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        this.isLoading = true;
        document.getElementById('scroll-loader').classList.remove('hidden');

        // Enforce educational syntax & strip junk genres
        const safeQuery = `${rawQuery} (lecture OR course OR tutorial OR explained OR lesson) -gameplay -vlog -reaction -prank`;
        
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=12&q=${encodeURIComponent(safeQuery)}&type=video&videoCategoryId=27&safeSearch=strict&pageToken=${pageToken}&key=${API_KEY}`;

        try {
            const res = await fetch(searchUrl);
            const data = await res.json();
            if (data.error) throw new Error(data.error.message);

            const videoIds = data.items.map(i => i.id.videoId).join(',');
            
            // Second pass: fetch true durations & views
            const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${videoIds}&key=${API_KEY}`;
            const statsRes = await fetch(statsUrl);
            const statsData = await statsRes.json();

            const compiledVideos = data.items.map((item, idx) => {
                const stat = statsData.items[idx];
                return {
                    id: item.id.videoId,
                    title: item.snippet.title,
                    channel: item.snippet.channelTitle,
                    published: item.snippet.publishedAt,
                    thumb: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
                    desc: item.snippet.description,
                    views: stat?.statistics?.viewCount || 0,
                    duration: this.parseISO8601(stat?.contentDetails?.duration || 'PT0S')
                };
            });

            const resultObj = { items: compiledVideos, nextPage: data.nextPageToken };
            this.cache.set(cacheKey, resultObj);
            this.isLoading = false;
            document.getElementById('scroll-loader').classList.add('hidden');
            return resultObj;

        } catch (err) {
            this.isLoading = false;
            document.getElementById('scroll-loader').classList.add('hidden');
            alert(`YouTube API Error: ${err.message}. Check your API Key!`);
            return { items: [], nextPage: '' };
        }
    }

    /* --- VIEW ROUTERS --- */

    async loadHome() {
        this.switchView('grid');
        document.getElementById('view-title').innerText = "Fresh Academic Lectures";
        this.currentQuery = SUBJECT_POOL[Math.floor(Math.random() * SUBJECT_POOL.length)];
        
        this.renderSkeletons(8);
        const data = await this.executeEducationalFetch(this.currentQuery);
        this.nextPageToken = data.nextPage || '';
        this.renderGrid(data.items, false);
    }

    async loadTrending() {
        this.switchView('grid');
        document.getElementById('view-title').innerText = "Trending in Academia";
        this.currentQuery = "University lecture 2024";
        this.renderSkeletons(8);
        const data = await this.executeEducationalFetch(this.currentQuery);
        this.nextPageToken = data.nextPage || '';
        this.renderGrid(data.items, false);
    }

    async search(query) {
        if(!query.trim()) return;
        document.getElementById('search-suggestions').classList.add('hidden');
        this.switchView('grid');
        document.getElementById('view-title').innerText = `Results for: "${query}"`;
        this.currentQuery = query;
        this.renderSkeletons(8);
        const data = await this.executeEducationalFetch(this.currentQuery);
        this.nextPageToken = data.nextPage || '';
        this.renderGrid(data.items, false);
    }

    async filterCategory(queryText, chipDOM) {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chipDOM.classList.add('active');
        if (queryText === 'All') return this.loadHome();
        this.search(queryText);
    }

    async fetchAndAppend() {
        const data = await this.executeEducationalFetch(this.currentQuery, this.nextPageToken);
        this.nextPageToken = data.nextPage || '';
        this.renderGrid(data.items, true);
    }

    openWatchView(videoObj) {
        this.activeVideo = videoObj;
        this.switchView('watch');
        
        document.getElementById('video-iframe').src = `https://www.youtube.com/embed/${videoObj.id}?autoplay=1`;
        document.getElementById('watch-title').innerText = videoObj.title;
        document.getElementById('watch-channel').innerText = videoObj.channel;
        document.getElementById('watch-date').innerText = this.timeAgo(videoObj.published);
        document.getElementById('watch-views').innerText = `${this.formatNumber(videoObj.views)} views`;
        document.getElementById('watch-desc').innerText = videoObj.desc || "No syllabus description provided.";

        // Update Save Button visually
        const isSaved = this.bookmarks.some(b => b.id === videoObj.id);
        const saveBtn = document.getElementById('save-btn');
        saveBtn.className = isSaved ? 'action-btn saved' : 'action-btn';
        saveBtn.innerHTML = `<i class="fa-${isSaved ? 'solid' : 'regular'} fa-bookmark"></i> <span>${isSaved ? 'Saved' : 'Save'}</span>`;

        // Push to local storage history
        this.history = [videoObj, ...this.history.filter(h => h.id !== videoObj.id)].slice(0, 50);
        localStorage.setItem('edu_history', JSON.stringify(this.history));

        this.loadRecommendations(videoObj.title);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async loadRecommendations(contextTitle) {
        const recList = document.getElementById('recommendation-list');
        recList.innerHTML = '';
        const cleanTopic = contextTitle.split(' ').slice(0, 3).join(' ');
        const data = await this.executeEducationalFetch(cleanTopic);
        
        data.items.forEach(vid => {
            if(vid.id === this.activeVideo.id) return;
            const card = document.createElement('div');
            card.className = 'rec-card';
            card.onclick = () => this.openWatchView(vid);
            card.innerHTML = `
                <div class="rec-thumb"><img src="${vid.thumb}"><span class="duration-badge">${vid.duration}</span></div>
                <div class="meta-lines">
                    <h4 style="font-size:0.88rem;">${vid.title}</h4>
                    <p style="font-size:0.75rem;">${vid.channel}</p>
                    <p style="font-size:0.75rem;">${this.formatNumber(vid.views)} views</p>
                </div>
            `;
            recList.appendChild(card);
        });
    }

    /* --- LOCAL LIBRARY VIEWS --- */

    showBookmarks() {
        this.switchView('grid');
        document.getElementById('view-title').innerText = "Saved Lectures";
        this.nextPageToken = ''; // disable infinite scroll on local arrays
        this.renderGrid(this.bookmarks, false);
    }

    showHistory() {
        this.switchView('grid');
        document.getElementById('view-title').innerText = "Study History";
        this.nextPageToken = '';
        this.renderGrid(this.history, false);
    }

    toggleSaveCurrent() {
        if(!this.activeVideo) return;
        const exists = this.bookmarks.findIndex(b => b.id === this.activeVideo.id);
        const saveBtn = document.getElementById('save-btn');
        
        if (exists > -1) {
            this.bookmarks.splice(exists, 1);
            saveBtn.className = 'action-btn';
            saveBtn.innerHTML = `<i class="fa-regular fa-bookmark"></i> <span>Save</span>`;
        } else {
            this.bookmarks.push(this.activeVideo);
            saveBtn.className = 'action-btn saved';
            saveBtn.innerHTML = `<i class="fa-solid fa-bookmark"></i> <span>Saved</span>`;
        }
        localStorage.setItem('edu_bookmarks', JSON.stringify(this.bookmarks));
    }

    shareVideo() {
        navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${this.activeVideo.id}`);
        alert("Lecture link copied to clipboard!");
    }

    /* --- RENDERING --- */

    switchView(mode) {
        const grid = document.getElementById('grid-view');
        const watch = document.getElementById('watch-view');
        if (mode === 'grid') {
            grid.classList.remove('hidden');
            watch.classList.add('hidden');
            document.getElementById('video-iframe').src = ''; // stop audio
        } else {
            grid.classList.add('hidden');
            watch.classList.remove('hidden');
        }
    }

    renderGrid(videoArray, append = false) {
        const grid = document.getElementById('video-grid');
        if (!append) grid.innerHTML = '';

        if(videoArray.length === 0 && !append) {
            grid.innerHTML = `<p style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted);">No educational records found.</p>`;
            return;
        }

        videoArray.forEach(vid => {
            const card = document.createElement('div');
            card.className = 'video-card';
            card.onclick = () => this.openWatchView(vid);
            card.innerHTML = `
                <div class="thumb-wrap">
                    <img src="${vid.thumb}" alt="thumbnail" loading="lazy">
                    <span class="duration-badge">${vid.duration}</span>
                </div>
                <div class="card-meta">
                    <div class="channel-icon">${vid.channel[0]}</div>
                    <div class="meta-lines">
                        <h4>${vid.title}</h4>
                        <p>${vid.channel}</p>
                        <p>${this.formatNumber(vid.views)} views • ${this.timeAgo(vid.published)}</p>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    renderSkeletons(count) {
        const grid = document.getElementById('video-grid');
        grid.innerHTML = '';
        for(let i=0; i<count; i++){
            grid.innerHTML += `
                <div class="video-card skeleton-card">
                    <div class="thumb-wrap"></div>
                    <div class="card-meta" style="margin-top:8px;">
                        <div class="channel-icon" style="background:var(--skeleton);"></div>
                        <div style="flex:1;">
                            <div class="skeleton-line" style="width:90%;"></div>
                            <div class="skeleton-line" style="width:60%;"></div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    handleSuggestions(val) {
        const box = document.getElementById('search-suggestions');
        if(!val || val.length < 2) { box.classList.add('hidden'); return; }
        
        const matches = SUBJECT_POOL.filter(s => s.toLowerCase().includes(val.toLowerCase())).slice(0, 5);
        if(matches.length === 0) { box.classList.add('hidden'); return; }

        box.innerHTML = '';
        matches.forEach(m => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `<i class="fa-solid fa-clock-rotate-left" style="color:var(--text-muted)"></i> <span>${m}</span>`;
            div.onclick = () => { document.getElementById('search-input').value = m; this.search(m); };
            box.appendChild(div);
        });
        box.classList.remove('hidden');
    }

    /* --- STRING & MATH HELPERS --- */

    parseISO8601(durationString) {
        const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return "0:00";
        const h = match[1] ? `${match[1]}:` : '';
        const m = match[2] ? (h ? match[2].padStart(2,'0') : match[2]) + ':' : '0:';
        const s = match[3] ? match[3].padStart(2,'0') : '00';
        return `${h}${m}${s}`;
    }

    formatNumber(num) {
        num = Number(num);
        if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
        return num;
    }

    timeAgo(dateParam) {
        if(!dateParam) return '';
        const seconds = Math.floor((new Date() - new Date(dateParam)) / 1000);
        let i = seconds / 31536000; if (i > 1) return `${Math.floor(i)} years ago`;
        i = seconds / 2592000; if (i > 1) return `${Math.floor(i)} months ago`;
        i = seconds / 86400; if (i > 1) return `${Math.floor(i)} days ago`;
        return 'Recently';
    }
}

const app = new EduTubeApp();
