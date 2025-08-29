document.addEventListener('DOMContentLoaded', () => {
    const appRoot = document.getElementById('app-root');
    let currentUser = null;
    let currentSocket = null;

    // --- TEMPLATES (Based on your original .ejs files) ---
    const templates = {
        home: (data) => `
            <div id="vanta-bg"></div>
            <div class="relative z-10 flex flex-col items-center justify-center min-h-screen text-white p-4">
                <div class="text-center animate-fadeInUp">
                    <h1 class="text-5xl md:text-7xl font-bold mb-4">Welcome to SyncRoom</h1>
                    <p class="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                        A seamless real-time communication platform for teams and communities. Join rooms, share ideas, and stay connected.
                    </p>
                    <div class="flex justify-center gap-4">
                        ${data.user ? `
                            <a href="/groups" class="bg-violet-600 text-white font-bold py-3 px-8 rounded-full hover:bg-violet-700 transition-transform hover:scale-105">Go to Your Groups</a>
                        ` : `
                            <a href="/login" class="bg-violet-600 text-white font-bold py-3 px-8 rounded-full hover:bg-violet-700 transition-transform hover:scale-105">Login</a>
                            <a href="/register" class="bg-gray-700 text-white font-bold py-3 px-8 rounded-full hover:bg-gray-600 transition-transform hover:scale-105">Register</a>
                        `}
                    </div>
                </div>
            </div>
        `,
        login: () => `
            <div id="particles-js"></div>
            <div class="relative z-10 min-h-screen flex items-center justify-center p-4">
                <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center text-white mb-8">Login to SyncRoom</h2>
                    <form id="login-form" class="space-y-6">
                        <input type="text" name="username" placeholder="Username" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                        <input type="password" name="password" placeholder="Password" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                        <button type="submit" class="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition">Login</button>
                    </form>
                    <p class="text-center mt-6 text-gray-400">
                        Don't have an account? <a href="/register" class="text-violet-400 hover:underline">Register here</a>
                    </p>
                </div>
            </div>
        `,
        register: () => `
             <div id="particles-js"></div>
             <div class="relative z-10 min-h-screen flex items-center justify-center p-4">
                 <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center text-white mb-8">Create Account</h2>
                    <form id="register-form" class="space-y-4">
                         <input type="text" name="username" placeholder="Username" class="w-full p-3 bg-gray-800/50 rounded-lg" required>
                         <input type="email" name="email" placeholder="Email" class="w-full p-3 bg-gray-800/50 rounded-lg" required>
                         <input type="password" name="password" placeholder="Password" class="w-full p-3 bg-gray-800/50 rounded-lg" required>
                         <input type="password" name="confirmPassword" placeholder="Confirm Password" class="w-full p-3 bg-gray-800/50 rounded-lg" required>
                        <button type="submit" class="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition">Register</button>
                    </form>
                    <p class="text-center mt-6 text-gray-400">
                        Already have an account? <a href="/login" class="text-violet-400 hover:underline">Login here</a>
                    </p>
                </div>
            </div>
        `,
        groups: (data) => `
            <div id="particles-js"></div>
            <div class="relative min-h-screen container mx-auto p-4 md:p-8">
                <header class="flex justify-between items-center mb-8 fade-in">
                    <h1 class="text-3xl font-bold text-white">Welcome, ${data.user.username}!</h1>
                    <div class="flex items-center gap-4">
                        <button id="logout-btn" class="text-sm text-gray-400 hover:underline">Logout</button>
                    </div>
                </header>
                <div id="groupsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 fade-in">
                    ${data.groups.length === 0 ? `
                        <div class="col-span-full text-center py-16">
                            <p class="text-gray-400">You haven't joined or created any groups yet.</p>
                        </div>` : 
                        data.groups.map(group => `
                        <div class="group-card glass-card rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 p-6 flex flex-col justify-between">
                            <div>
                                <h3 class="font-bold group-name text-xl mb-2 text-white">${group.name}</h3>
                                <span class="text-xs capitalize bg-gray-500/20 text-gray-300 px-2 py-1 rounded-full font-medium">${group.role}</span>
                            </div>
                             <div class="flex items-center gap-2 mt-4">
                                <a href="/chat/${group.id}" class="text-center w-full bg-violet-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-violet-600 transition-all duration-300">Enter Chat</a>
                                ${group.role !== 'owner' ? `
                                    <form class="leave-group-form" data-group-id="${group.id}">
                                        <button type="submit" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 transition-all">Leave</button>
                                    </form>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button id="open-modal-btn" class="fixed bottom-8 right-8 bg-sky-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-3xl hover:bg-sky-600 transition-transform hover:scale-110">
                    <i class="fas fa-plus"></i>
                </button>
                <div id="group-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div class="bg-slate-800 w-full max-w-md m-4 p-6 rounded-2xl shadow-2xl relative text-gray-200">
                        <button id="close-modal-btn" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i class="fas fa-times fa-lg"></i></button>
                        <div id="create-form">
                            <h2 class="text-2xl font-semibold mb-4">Create a New Group</h2>
                            <form id="create-group-form" class="space-y-4">
                                <input type="text" name="name" placeholder="Group Name" class="w-full p-3 bg-gray-700 rounded-lg" required>
                                <input type="password" name="key" placeholder="Group Key" class="w-full p-3 bg-gray-700 rounded-lg" required>
                                <button type="submit" class="w-full bg-violet-500 text-white py-3 rounded-lg font-semibold hover:bg-violet-600">Create</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `,
        // The chat template is very large and complex to manage here.
        // It will be loaded dynamically via a fetch request to keep this file cleaner.
    };

    // --- API & RENDER HELPERS ---
    const api = {
        get: (url) => fetch(url).then(res => res.ok ? res.json() : Promise.reject(res)),
        post: (url, data) => fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(res => res.ok ? res.json() : Promise.reject(res))
    };

    const render = (html) => {
        appRoot.innerHTML = html;
        // Re-initialize background effects based on the page
        if (document.getElementById('vanta-bg')) {
            if (window.VANTA && !window.vantaEffect) {
                window.vantaEffect = VANTA.NET({ el: "#vanta-bg", color: 0x3b82f6, backgroundColor: 0x111827 });
            }
        } else if (document.getElementById('particles-js')) {
            if (window.vantaEffect) {
                window.vantaEffect.destroy();
                window.vantaEffect = null;
            }
            if (window.particlesJS) {
                particlesJS('particles-js', { particles: { number: { value: 50 }, color: { value: "#ffffff" }, shape: { type: "circle" }, opacity: { value: 0.3 }, size: { value: 2 }, move: { speed: 1.5 } } });
            }
        }
    };
    
    // --- ROUTER & PAGE RENDERERS ---
    const router = async () => {
        if (currentSocket) {
            currentSocket.disconnect();
            currentSocket = null;
        }
        
        const path = window.location.pathname;
        const chatMatch = path.match(/^\/chat\/(\d+)$/);

        try {
            const session = await api.get('/api/session');
            currentUser = session.user;
        } catch (error) {
            currentUser = null;
        }

        if (chatMatch && currentUser) {
            renderChat(chatMatch[1]);
        } else if (path === '/groups' && currentUser) {
            renderGroups();
        } else if (path === '/register' && !currentUser) {
            renderRegister();
        } else if (path === '/login' && !currentUser) {
            renderLogin();
        } else if (currentUser) {
             navigateTo('/groups');
        } else {
             renderHome();
        }
    };

    const renderHome = async () => {
        try {
            const session = await api.get('/api/session');
            render(templates.home(session));
        } catch (e) {
            render(templates.home({ user: null }));
        }
    };

    const renderLogin = () => {
        render(templates.login());
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            try {
                await api.post('/api/login', data);
                navigateTo('/groups');
            } catch (err) {
                alert('Login failed.');
            }
        });
    };

    const renderRegister = () => {
        render(templates.register());
        document.getElementById('register-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            if (data.password !== data.confirmPassword) {
                return alert('Passwords do not match.');
            }
            try {
                await api.post('/api/register', data);
                navigateTo('/groups');
            } catch (err) {
                alert('Registration failed.');
            }
        });
    };

    const renderGroups = async () => {
        try {
            const data = await api.get('/api/groups');
            render(templates.groups(data));
            attachGroupsListeners();
        } catch (err) {
            navigateTo('/login');
        }
    };

    const renderChat = async (groupId) => {
        try {
            // Fetch the raw EJS content as text
            const response = await fetch(`/views/chat.ejs`);
            const chatTemplateText = await response.text();

            // Fetch the chat data
            const data = await api.get(`/api/chat/${groupId}`);
            
            // This is a simple client-side "render" of the EJS template.
            // It replaces <%= ... %> placeholders. A more robust solution would use a library.
            let renderedHtml = chatTemplateText;
            const placeholders = {
                ...data,
                'group.name': data.group.name,
                'group.id': data.group.id,
                'user.username': data.user.username,
                'user.id': data.user.id,
                'userRole': data.userRole,
            };
            
            // This regex is a simplified EJS replacement and might not cover all cases
            renderedHtml = renderedHtml.replace(/<%[=-](.+?)%>/g, (match, key) => {
                const trimmedKey = key.trim();
                // This is a very basic replacement logic.
                // It won't handle loops or conditionals.
                // For a full SPA, we'd need to rebuild the chat UI in pure JS.
                return placeholders[trimmedKey] || '';
            });

            // For now, let's just indicate we've loaded it, as full rendering is complex
             appRoot.innerHTML = `<div class="p-8 text-white">
                <h1 class="text-2xl">Loaded chat for ${data.group.name}</h1>
                <p class="mt-4">NOTE: Fully rendering the dynamic chat page with all its scripts inside an SPA requires rebuilding the chat component in JavaScript. This demonstrates loading the data and template.</p>
                <a href="/groups" class="text-violet-400">&larr; Back to Groups</a>
                </div>`;
            // To make the chat fully functional, all the <script> logic from chat.ejs
            // would need to be re-written and executed here.
        } catch (err) {
             navigateTo('/groups');
        }
    };

    // --- EVENT LISTENERS ---
    const attachGroupsListeners = () => {
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/api/logout');
            navigateTo('/');
        });
        const modal = document.getElementById('group-modal');
        document.getElementById('open-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
        document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        document.getElementById('create-group-form').addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            await api.post('/api/groups/create', data);
            router();
        });
         document.querySelectorAll('.leave-group-form').forEach(form => {
            form.addEventListener('submit', async e => {
                e.preventDefault();
                if (confirm('Are you sure you want to leave this group?')) {
                    const groupId = e.target.dataset.groupId;
                    await api.post(`/api/groups/leave/${groupId}`);
                    router();
                }
            });
        });
    };

    // --- NAVIGATION ---
    const navigateTo = (path) => {
        window.history.pushState({}, '', path);
        router();
    };
    window.addEventListener('popstate', router);
    appRoot.addEventListener('click', e => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.getAttribute('href').startsWith('/')) {
            e.preventDefault();
            navigateTo(anchor.getAttribute('href'));
        }
    });

    // --- INITIALIZATION ---
    router();
});
