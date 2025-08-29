document.addEventListener('DOMContentLoaded', () => {
    const appRoot = document.getElementById('app-root');
    let currentUser = null;
    let currentSocket = null;

    // --- TEMPLATES ---
    // The HTML from your .ejs files is converted into JavaScript template literals.
    const templates = {
        login: () => `
            <div class="min-h-screen flex items-center justify-center p-4">
                <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center text-white mb-8">Login to SyncRoom</h2>
                    <form id="login-form" class="space-y-6">
                        <div>
                            <label for="username" class="sr-only">Username</label>
                            <input type="text" name="username" placeholder="Username" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                        </div>
                        <div>
                            <label for="password" class="sr-only">Password</label>
                            <input type="password" name="password" placeholder="Password" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                        </div>
                        <button type="submit" class="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition">Login</button>
                    </form>
                    <p class="text-center mt-6 text-gray-400">
                        Don't have an account? <a href="/register" class="text-violet-400 hover:underline">Register here</a>
                    </p>
                </div>
            </div>
        `,
        register: () => `
            <div class="min-h-screen flex items-center justify-center p-4">
                 <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center text-white mb-8">Create Account</h2>
                    <form id="register-form" class="space-y-4">
                         <input type="text" name="username" placeholder="Username" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                         <input type="email" name="email" placeholder="Email" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                         <input type="password" name="password" placeholder="Password" class="w-full p-3 bg-gray-800/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                        <button type="submit" class="w-full bg-violet-600 text-white py-3 rounded-lg font-semibold hover:bg-violet-700 transition">Register</button>
                    </form>
                    <p class="text-center mt-6 text-gray-400">
                        Already have an account? <a href="/login" class="text-violet-400 hover:underline">Login here</a>
                    </p>
                </div>
            </div>
        `,
        groups: (data) => `
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
                            <p class="text-gray-500 mt-2">Click the '+' button to get started!</p>
                        </div>
                    ` : data.groups.map(group => `
                        <div class="group-card glass-card rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 p-6 flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start">
                                    <h3 class="font-bold group-name text-xl mb-2 text-white">${group.name}</h3>
                                    <span class="text-xs capitalize bg-gray-500/20 text-gray-300 px-2 py-1 rounded-full font-medium">${group.role}</span>
                                </div>
                                <p class="text-gray-400 text-sm mb-4">You are a ${group.role} of this group.</p>
                            </div>
                             <div class="flex items-center gap-2 mt-4">
                                <a href="/chat/${group.id}" class="text-center w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold py-2 px-4 rounded-lg hover:from-violet-600 hover:to-fuchsia-600 transition-all duration-300 shadow-md">Enter Chat</a>
                                ${group.role !== 'owner' ? `
                                    <form class="leave-group-form" data-group-id="${group.id}">
                                        <button type="submit" class="text-center w-full bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 transition-all duration-300 shadow-md">Leave</button>
                                    </form>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button id="open-modal-btn" class="fixed bottom-8 right-8 bg-gradient-to-r from-sky-500 to-indigo-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-3xl hover:from-sky-600 hover:to-indigo-600 transition-transform hover:scale-110">
                    <i class="fas fa-plus"></i>
                </button>
                <!-- Modal for Create/Join Group -->
                <div id="group-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                    <div class="bg-slate-800 w-full max-w-md m-4 p-6 rounded-2xl shadow-2xl relative text-gray-200">
                        <button id="close-modal-btn" class="absolute top-4 right-4 text-gray-500 hover:text-white transition"><i class="fas fa-times fa-lg"></i></button>
                        <div class="mb-6 border-b border-gray-600">
                            <nav class="flex space-x-4">
                                <button id="create-tab" class="tab-btn active-tab font-medium px-1 py-2 text-violet-400 border-b-2 border-violet-500">Create Group</button>
                                <button id="join-tab" class="tab-btn font-medium px-1 py-2 text-gray-400 hover:text-white">Join Group</button>
                            </nav>
                        </div>
                        <div id="create-form">
                            <h2 class="text-2xl font-semibold mb-4">Create a New Group</h2>
                            <form id="create-group-form" class="space-y-4">
                                <input type="text" name="name" placeholder="Group Name" class="w-full p-3 border-2 border-transparent rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                                <input type="password" name="key" placeholder="Group Key (Password)" class="w-full p-3 border-2 border-transparent rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" required>
                                <button type="submit" class="w-full bg-violet-500 text-white py-3 rounded-lg font-semibold hover:bg-violet-600">Create Group</button>
                            </form>
                        </div>
                        <div id="join-form" class="hidden">
                            <h2 class="text-2xl font-semibold mb-4">Join an Existing Group</h2>
                            <form id="join-group-form" class="space-y-4">
                                <input type="text" name="name" placeholder="Group Name" class="w-full p-3 border-2 border-transparent rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500" required>
                                <input type="password" name="key" placeholder="Group Key (Password)" class="w-full p-3 border-2 border-transparent rounded-lg bg-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500" required>
                                <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600">Join Group</button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `,
        chat: (data) => `
            <!-- The entire chat.ejs content goes here, converted to a template literal -->
            <!-- This is a simplified version for brevity. The full version would include all modals and scripts -->
            <div class="glass-ui rounded-2xl shadow-2xl h-full flex overflow-hidden">
                <!-- Sidebar -->
                <aside id="chat-sidebar" class="sidebar flex flex-col">
                    <!-- Sidebar content from chat.ejs -->
                </aside>
                <!-- Main Chat Area -->
                <main class="main-chat flex flex-col flex-grow">
                    <!-- Main chat content from chat.ejs -->
                </main>
            </div>
        `
        // Note: The full chat template is very long. In a real scenario, it would be fully included here.
        // For this example, we'll focus on the routing logic.
    };

    // --- API HELPERS ---
    const api = {
        get: (url) => fetch(url).then(res => res.ok ? res.json() : Promise.reject(res)),
        post: (url, data) => fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        }).then(res => res.ok ? res.json() : Promise.reject(res))
    };

    // --- ROUTER ---
    const router = async () => {
        // Disconnect from any existing chat socket before navigating
        if (currentSocket) {
            currentSocket.disconnect();
            currentSocket = null;
        }
        
        const path = window.location.pathname;
        const chatMatch = path.match(/^\/chat\/(\d+)$/);

        // Check user session
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
        } else if (path === '/register') {
            renderRegister();
        } else if (path === '/login' || !currentUser) {
            renderLogin();
        } else {
            // Default route if logged in
            navigateTo('/groups');
        }
    };

    // --- RENDER FUNCTIONS ---
    const render = (html) => {
        appRoot.innerHTML = html;
        // Re-initialize particles on every render
        if (window.particlesJS) {
             const particleConfig = { particles: { number: { value: 50 }, color: { value: "#ffffff" }, shape: { type: "circle" }, opacity: { value: 0.3, random: true }, size: { value: 2, random: true }, line_linked: { enable: false }, move: { enable: true, speed: 1.5 } }, interactivity: { events: { onhover: { enable: true, mode: "bubble" } } } };
             particlesJS('particles-js', particleConfig);
        }
    };
    
    const renderLogin = () => {
        render(templates.login());
        const form = document.getElementById('login-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            try {
                await api.post('/api/login', data);
                navigateTo('/groups');
            } catch (err) {
                alert('Login failed. Please check your credentials.');
            }
        });
    };

    const renderRegister = () => {
        render(templates.register());
        const form = document.getElementById('register-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
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
            // For now, we just show a placeholder.
            // A full implementation would fetch chat data and render the full chat template.
            const data = await api.get(`/api/chat/${groupId}`);
            // This template is incomplete, would need the full HTML from chat.ejs
            // render(templates.chat(data));
            appRoot.innerHTML = `
                <div class="p-8">
                    <h1 class="text-3xl">Entering Chat for Group ${data.group.name}...</h1>
                    <p class="mt-4"><a href="/groups" class="text-violet-400 hover:underline">&larr; Back to Groups</a></p>
                    <div class="mt-8 bg-gray-800 p-4 rounded-lg">
                        <p class="font-mono text-sm text-gray-300">NOTE: The full chat UI would be rendered here. This is the final step where the chat's specific JavaScript, including Socket.IO connections, would be initialized.</p>
                    </div>
                </div>
            `;
            // initializeChat(groupId, data); // This function would contain all the chat.ejs script logic
        } catch (err) {
             navigateTo('/groups');
        }
    };

    // --- EVENT LISTENERS ---
    const attachGroupsListeners = () => {
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/api/logout');
            navigateTo('/login');
        });

        // Modal logic
        const modal = document.getElementById('group-modal');
        document.getElementById('open-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
        document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
        
        // Tab switching
        const createTab = document.getElementById('create-tab');
        const joinTab = document.getElementById('join-tab');
        const createForm = document.getElementById('create-form');
        const joinForm = document.getElementById('join-form');
        createTab.addEventListener('click', () => {
            joinForm.classList.add('hidden');
            createForm.classList.remove('hidden');
        });
        joinTab.addEventListener('click', () => {
            createForm.classList.add('hidden');
            joinForm.classList.remove('hidden');
        });
        
        // Form submissions
        document.getElementById('create-group-form').addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            await api.post('/api/groups/create', data);
            router(); // Re-render the groups page
        });
        document.getElementById('join-group-form').addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            await api.post('/api/groups/join', data);
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
        if (e.target.matches('a')) {
            const href = e.target.getAttribute('href');
            if (href && href.startsWith('/')) {
                e.preventDefault();
                navigateTo(href);
            }
        }
    });

    // --- INITIALIZATION ---
    router();
});
