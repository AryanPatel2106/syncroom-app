document.addEventListener('DOMContentLoaded', () => {
    const appRoot = document.getElementById('app-root');
    let currentUser = null;
    let currentSocket = null;

    // --- TEMPLATES (Based on your original .ejs files) ---
    const templates = {
        home: (data) => `
            <div id="vanta-bg" class="fixed top-0 left-0 w-full h-full z-0"></div>
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
            <div id="particles-js" class="fixed top-0 left-0 w-full h-full z-0"></div>
            <div class="relative z-10 min-h-screen flex items-center justify-center p-4 text-white">
                <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center mb-8">Login to SyncRoom</h2>
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
             <div id="particles-js" class="fixed top-0 left-0 w-full h-full z-0"></div>
             <div class="relative z-10 min-h-screen flex items-center justify-center p-4 text-white">
                 <div class="max-w-md w-full glass-ui rounded-2xl shadow-lg p-8 form-container">
                    <h2 class="text-3xl font-bold text-center mb-8">Create Account</h2>
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
            <div id="particles-js" class="fixed top-0 left-0 w-full h-full z-0"></div>
            <div class="relative min-h-screen container mx-auto p-4 md:p-8 text-white">
                <header class="flex justify-between items-center mb-8 fade-in">
                    <h1 class="text-3xl font-bold">Welcome, ${data.user.username}!</h1>
                    <div class="flex items-center gap-4">
                        <button id="logout-btn" class="text-sm text-gray-400 hover:underline">Logout</button>
                    </div>
                </header>
                <div id="groupsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 fade-in">
                    ${data.groups.length === 0 ? `
                        <div class="col-span-full text-center py-16">
                            <p class="text-gray-400">You haven't joined or created any groups yet.</p>
                             <p class="text-gray-500 mt-2">Click the '+' button to get started!</p>
                        </div>` : 
                        data.groups.map(group => `
                        <div class="group-card glass-card rounded-2xl shadow-lg hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 p-6 flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start">
                                    <h3 class="font-bold group-name text-xl mb-2">${group.name}</h3>
                                    <span class="text-xs capitalize bg-gray-500/20 text-gray-300 px-2 py-1 rounded-full font-medium">${group.role}</span>
                                </div>
                                <p class="text-gray-400 text-sm mb-4">You are a ${group.role} of this group.</p>
                            </div>
                            <div class="flex items-center gap-2 mt-4">
                                <a href="/chat/${group.id}" class="text-center w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-semibold py-2 px-4 rounded-lg hover:from-violet-600 hover:to-fuchsia-600 transition-all duration-300 shadow-md">Enter Chat</a>
                                ${group.role !== 'owner' ? `
                                    <form class="leave-group-form" data-group-id="${group.id}">
                                        <button type="submit" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 transition-all"><i class="fas fa-sign-out-alt"></i></button>
                                    </form>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button id="open-modal-btn" class="fixed bottom-8 right-8 bg-gradient-to-r from-sky-500 to-indigo-500 text-white w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-3xl hover:from-sky-600 hover:to-indigo-600 transition-transform hover:scale-110">
                    <i class="fas fa-plus"></i>
                </button>
                 <div id="group-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                    <div class="bg-slate-800 w-full max-w-md m-4 p-6 rounded-2xl shadow-2xl relative text-gray-200">
                      <button id="close-modal-btn" class="absolute top-4 right-4 text-gray-500 hover:text-white"><i class="fas fa-times fa-lg"></i></button>
                      <div class="mb-6 border-b border-gray-600">
                        <nav class="flex space-x-4" aria-label="Tabs">
                          <button id="create-tab-btn" class="tab-btn active-tab font-medium px-1 py-2 text-violet-400 border-b-2 border-violet-500">Create Group</button>
                          <button id="join-tab-btn" class="tab-btn font-medium px-1 py-2 text-gray-400 hover:text-gray-200">Join Group</button>
                        </nav>
                      </div>
                      <div id="create-group-form-container">
                        <h2 class="text-2xl font-semibold mb-4">Create a New Group</h2>
                        <form id="create-group-form" class="space-y-4">
                          <input type="text" name="name" placeholder="Group Name" class="w-full p-3 bg-gray-700 rounded-lg" required>
                          <input type="password" name="key" placeholder="Group Key (Password)" class="w-full p-3 bg-gray-700 rounded-lg" required>
                          <button type="submit" class="w-full bg-violet-500 text-white py-3 rounded-lg font-semibold hover:bg-violet-600">Create Group</button>
                        </form>
                      </div>
                      <div id="join-group-form-container" class="hidden">
                        <h2 class="text-2xl font-semibold mb-4">Join an Existing Group</h2>
                        <form id="join-group-form" class="space-y-4">
                          <input type="text" name="name" placeholder="Group Name" class="w-full p-3 bg-gray-700 rounded-lg" required>
                          <input type="password" name="key" placeholder="Group Key (Password)" class="w-full p-3 bg-gray-700 rounded-lg" required>
                          <button type="submit" class="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600">Join Group</button>
                        </form>
                      </div>
                    </div>
                </div>
            </div>
        `,
        chat: () => `
            <div id="particles-js" class="fixed top-0 left-0 w-full h-full z-0"></div>
            <div class="relative z-10 h-full p-2 sm:p-4">
                <div class="glass-ui rounded-2xl shadow-2xl h-full flex overflow-hidden">
                    <aside id="chat-sidebar" class="sidebar flex flex-col">
                        <!-- Sidebar content is generated dynamically -->
                    </aside>
                    <div id="sidebar-backdrop" class="sidebar-backdrop"></div>
                    <main class="main-chat flex flex-col flex-grow">
                        <!-- Main chat content is generated dynamically -->
                    </main>
                </div>
            </div>
            <!-- Modals are generated dynamically below -->
        `
    };

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
        const oldModals = document.getElementById('modals-container');
        if(oldModals) oldModals.remove();

        if (window.vantaEffect) {
            window.vantaEffect.destroy();
            window.vantaEffect = null;
        }
        if (document.getElementById('vanta-bg')) {
             window.vantaEffect = VANTA.NET({ el: "#vanta-bg", color: 0x3b82f6, backgroundColor: 0x111827, points: 12.00, maxDistance: 25.00, spacing: 18.00 });
        } else if (document.getElementById('particles-js')) {
             particlesJS('particles-js', { particles: { number: { value: 50 }, color: { value: "#ffffff" }, shape: { type: "circle" }, opacity: { value: 0.3 }, size: { value: 2 }, move: { speed: 1.5 } } });
        }
    };
    
    // --- CORRECTED ROUTER ---
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

        if (path === '/') {
            renderHome();
        } else if (chatMatch && currentUser) {
            renderChat(chatMatch[1]);
        } else if (path === '/groups' && currentUser) {
            renderGroups();
        } else if (path === '/register' && !currentUser) {
            render(templates.register());
            attachAuthListeners();
        } else if (path === '/login' && !currentUser) {
            render(templates.login());
            attachAuthListeners();
        } else if (currentUser) {
            navigateTo('/groups'); // User is logged in but tried an invalid URL
        } else {
            navigateTo('/login'); // User is logged out and tried to access a protected page
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
            const data = await api.get(`/api/chat/${groupId}`);
            render(templates.chat()); 
            buildChatUI(data);
            initializeChatLogic(data);
        } catch (err) {
             navigateTo('/groups');
        }
    };

    const attachAuthListeners = () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.target).entries());
                try {
                    await api.post('/api/login', data);
                    navigateTo('/groups');
                } catch (err) {
                    alert('Login failed. Please check your username and password.');
                }
            });
        }

        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.target).entries());
                if (data.password !== data.confirmPassword) {
                    return alert('Passwords do not match.');
                }
                try {
                    await api.post('/api/register', data);
                    navigateTo('/groups');
                } catch (err) {
                    alert('Registration failed. Please try a different username or email.');
                }
            });
        }
    };

    const attachGroupsListeners = () => {
        document.getElementById('logout-btn').addEventListener('click', async () => {
            await api.post('/api/logout');
            navigateTo('/');
        });
        
        const modal = document.getElementById('group-modal');
        document.getElementById('open-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
        document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));

        const createTab = document.getElementById('create-tab-btn');
        const joinTab = document.getElementById('join-tab-btn');
        const createForm = document.getElementById('create-group-form-container');
        const joinForm = document.getElementById('join-group-form-container');
        
        createTab.addEventListener('click', () => {
            createForm.classList.remove('hidden');
            joinForm.classList.add('hidden');
            createTab.classList.add('text-violet-400', 'border-violet-500');
            joinTab.classList.remove('text-violet-400', 'border-violet-500');
        });

        joinTab.addEventListener('click', () => {
            joinForm.classList.remove('hidden');
            createForm.classList.add('hidden');
            joinTab.classList.add('text-violet-400', 'border-violet-500');
            createTab.classList.remove('text-violet-400', 'border-violet-500');
        });

        document.getElementById('create-group-form').addEventListener('submit', async e => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target).entries());
            await api.post('/api/groups/create', data);
            router();
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
                if (confirm('Are you sure you want to leave this group permanently?')) {
                    const groupId = e.target.dataset.groupId;
                    await api.post(`/api/groups/leave/${groupId}`);
                    router();
                }
            });
        });
    };
    
    // --- CHAT UI BUILDER AND LOGIC ---
    const buildChatUI = (data) => {
        const sidebar = document.getElementById('chat-sidebar');
        const mainChat = document.querySelector('.main-chat');

        sidebar.innerHTML = `
            <div class="p-4">
                <div class="flex justify-between items-center mb-4">
                    <h1 class="text-2xl font-bold desktop-header">${data.group.name}</h1>
                    <div class="sidebar-close-btn">
                        <button id="close-sidebar-btn" class="text-gray-400 hover:text-white"><i class="fas fa-times text-2xl"></i></button>
                    </div>
                </div>
                <p class="text-sm text-gray-400 mb-6 desktop-header">Logged in as: ${data.user.username}</p>
            </div>
            <div class="px-4 mb-6">
                <h2 class="font-bold text-gray-300 mb-3 text-sm tracking-wider uppercase">Online Users</h2>
                <ul id="user-list" class="space-y-2 text-sm text-gray-300"></ul>
            </div>
            <div class="flex-grow p-4 space-y-2">
                 <h2 class="font-bold text-gray-300 mb-1 text-sm tracking-wider uppercase">Tools</h2>
                 <button id="calendar-btn" class="w-full text-sm bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"><i class="fas fa-calendar-alt mr-2"></i>Calendar</button>
                 <button id="view-files-btn" class="w-full text-sm bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"><i class="fas fa-folder-open mr-2"></i>View All Files</button>
            </div>
            <div class="p-4 border-t border-white/10 space-y-2">
                <form id="upload-form" action="/chat/${data.group.id}/upload" method="POST" enctype="multipart/form-data" target="upload_iframe">
                    <input type="file" name="file" class="w-full text-xs text-gray-400 file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-800 file:text-blue-200 hover:file:bg-blue-700 cursor-pointer" required>
                    <button type="submit" class="w-full mt-2 text-sm bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors font-semibold">Upload File</button>
                </form>
                <iframe name="upload_iframe" style="display:none"></iframe>
                ${data.userRole === 'owner' || data.userRole === 'admin' ? `<a href="/manage/${data.group.id}" class="block text-center text-sm bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"><i class="fas fa-users-cog mr-2"></i>Manage Group</a>` : ''}
                ${data.userRole !== 'owner' ? `<form id="leave-group-form-chat" data-group-id="${data.group.id}"><button type="submit" class="w-full text-sm bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors"><i class="fas fa-sign-out-alt mr-2"></i>Leave Group</button></form>` : ''}
            </div>
        `;

        const messagesHtml = data.messages.map(msg => buildMessageHtml(msg, data)).join('');
        mainChat.innerHTML = `
            <header class="mobile-header p-4 border-b border-white/10 items-center flex-shrink-0">
              <button id="sidebar-toggle-btn" class="text-gray-300 mr-4"><i class="fas fa-bars text-xl"></i></button>
              <h1 class="text-xl font-bold">${data.group.name}</h1>
            </header>
            <div id="message-container" class="flex-grow overflow-y-auto p-4 sm:p-6 space-y-6">${messagesHtml}</div>
            <div class="p-4 sm:p-6 border-t border-white/10 flex-shrink-0">
              <div id="typing-indicator" class="h-5 text-sm text-gray-400 italic"></div>
              <div id="reply-info" class="hidden bg-black bg-opacity-20 p-2 rounded-t-lg text-sm mb-2">
                Replying to <strong id="reply-username"></strong>: "<span id="reply-message"></span>"
                <button id="cancel-reply" class="float-right font-bold text-red-500 hover:text-red-400">×</button>
              </div>
              <form id="message-form" class="relative flex items-center gap-2 sm:gap-4">
                 <div id="emoji-picker" class="hidden absolute bottom-full mb-2 bg-gray-800/80 backdrop-blur-md border border-white/10 rounded-lg p-2 shadow-lg z-20"></div>
                 <button type="button" id="emoji-btn" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-lg"><i class="far fa-smile"></i></button>
                 <input id="message-input" class="flex-grow p-3 pl-10 bg-gray-800 bg-opacity-50 border border-transparent rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 transition" placeholder="Type a message..." autocomplete="off">
                 <button type="button" id="code-snippet-btn" class="text-gray-400 hover:text-gray-200 p-3 rounded-lg"><i class="fas fa-code"></i></button>
                 <button type="submit" class="bg-gradient-to-r from-sky-500 to-indigo-500 text-white px-5 py-3 rounded-lg hover:from-sky-600 hover:to-indigo-600 transition-all shadow-md"><i class="fas fa-paper-plane"></i></button>
              </form>
            </div>
        `;
        
        const modalsContainer = document.createElement('div');
        modalsContainer.id = 'modals-container';
        modalsContainer.innerHTML = buildModalsHtml(data);
        document.body.appendChild(modalsContainer);
    };

    const buildMessageHtml = (msg, data) => {
        const isCurrentUser = msg.user_id == data.user.id;
        const reactionsHtml = data.reactions.filter(r => r.message_id === msg.id).map(reaction => `<span class="bg-gray-800 bg-opacity-50 text-xs px-2 py-1 rounded-full cursor-pointer">${reaction.emoji}</span>`).join('');
        let deleteBtnHtml = '';
        if (isCurrentUser || ['owner', 'admin'].includes(data.userRole)) {
            deleteBtnHtml = `<button class="delete-btn hover:text-red-400" data-message-id="${msg.id}"><i class="fas fa-trash"></i></button>`;
        }
        
        let messageContentHtml;
        if (msg.is_code_snippet) {
             const escapedCode = msg.message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
             messageContentHtml = `<pre><code class="language-${msg.language || 'plaintext'} hljs">${escapedCode}</code></pre>`;
        } else {
            messageContentHtml = `<p class="text-base break-words mt-1">${msg.message}</p>`;
        }

        return `
            <div class="message-bubble w-full flex ${isCurrentUser ? 'justify-end' : 'justify-start'}" data-message-id="${msg.id}">
              <div class="max-w-md md:max-w-lg">
                <div class="rounded-xl px-4 py-2 ${isCurrentUser ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white' : 'bg-gray-700 bg-opacity-50 text-gray-200'}">
                  <div class="font-bold text-sm">${msg.username}</div>
                  ${msg.parent_message_id ? `<div class="border-l-2 border-blue-300 pl-2 text-xs opacity-80 mb-1 mt-1"><strong>${msg.parent_username}</strong>: ${msg.parent_message.substring(0, 50)}...</div>` : ''}
                  ${messageContentHtml}
                  <div class="reactions-container flex gap-1 mt-2">${reactionsHtml}</div>
                </div>
                <div class="flex items-center gap-2 mt-1 px-2 text-xs text-gray-500 ${isCurrentUser ? 'justify-end' : ''}">
                  <span>${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  <button class="reply-btn hover:text-blue-400" data-parent-id="${msg.id}" data-parent-username="${msg.username}" data-parent-message="${msg.message}"><i class="fas fa-reply"></i></button>
                  <button class="react-btn hover:text-yellow-400"><i class="fas fa-smile"></i></button>
                  ${deleteBtnHtml}
                </div>
              </div>
            </div>
        `;
    };

    const buildModalsHtml = (data) => {
        const filesHtml = data.files.map(file => `
            <div class="file-item p-3 rounded-lg bg-black bg-opacity-20 hover:bg-opacity-30 transition" data-file-id="${file.id}">
              ${file.mimetype && file.mimetype.startsWith('image/') ? `<img src="${file.filepath}" alt="${file.filename}" class="w-full h-32 object-cover rounded-md mb-2">` : `<div class="w-full h-32 rounded-md mb-2 bg-gray-700 flex items-center justify-center"><i class="fas fa-file-alt text-4xl text-gray-500"></i></div>`}
              <a href="${file.filepath}" target="_blank" class="text-blue-400 hover:underline text-sm break-all font-medium">${file.filename}</a>
              <div class="flex justify-between items-center mt-2">
                  <a href="${file.filepath.replace('/upload/', '/upload/fl_attachment/')}" class="text-green-400 hover:text-green-300 text-xs"><i class="fas fa-download mr-1"></i> Download</a>
                  ${file.user_id == data.user.id || ['owner', 'admin'].includes(data.userRole) ? `<button data-file-id="${file.id}" data-filepath="${file.filepath}" class="delete-file-btn text-red-500 hover:text-red-400 text-xs"><i class="fas fa-trash mr-1"></i> Delete</button>` : ''}
              </div>
            </div>
        `).join('');

        return `
            <div id="files-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                <div class="glass-ui rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
                    <header class="p-4 border-b border-white/10 flex justify-between items-center"><h2 class="text-xl font-bold">All Shared Files</h2><button id="close-files-modal-btn" class="text-gray-400 hover:text-white"><i class="fas fa-times text-2xl"></i></button></header>
                    <div id="modal-file-list" class="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">${filesHtml}</div>
                </div>
            </div>
            <div id="calendar-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                 <div class="glass-ui rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4">
                    <header class="p-4 border-b border-white/10 flex justify-between items-center"><h2 class="text-xl font-bold">Group Calendar</h2><button id="close-calendar-modal-btn" class="text-gray-400 hover:text-white"><i class="fas fa-times text-2xl"></i></button></header>
                    <div id="calendar-body" class="p-6 overflow-y-auto flex-grow"></div>
                    <footer class="p-4 border-t border-white/10">
                        <form id="event-form" class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                            <input type="text" name="title" placeholder="Event Title" class="p-2 bg-gray-800/50 rounded" required>
                            <input type="date" name="event_date" class="p-2 bg-gray-800/50 rounded" required>
                            <button type="submit" class="bg-violet-600 text-white py-2 rounded hover:bg-violet-700">Add Event</button>
                        </form>
                    </footer>
                </div>
            </div>
            <div id="code-snippet-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm">
                <div class="glass-ui rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col m-4">
                    <header class="p-4 border-b border-white/10 flex justify-between items-center"><h2 class="text-xl font-bold">Share Code Snippet</h2><button id="close-code-modal-btn" class="text-gray-400 hover:text-white"><i class="fas fa-times text-2xl"></i></button></header>
                    <div class="p-6">
                        <form id="code-snippet-form">
                            <textarea id="code-input" class="w-full h-64 p-2 bg-gray-900/80 rounded font-mono text-sm" placeholder="Paste your code here..."></textarea>
                            <select id="language-select" class="w-full mt-4 p-2 bg-gray-800/50 rounded">
                                <option value="javascript">JavaScript</option><option value="python">Python</option><option value="html">HTML</option><option value="css">CSS</option><option value="sql">SQL</option><option value="plaintext">Plain Text</option>
                            </select>
                            <button type="submit" class="w-full mt-4 bg-green-600 text-white py-2 rounded hover:bg-green-700">Share Snippet</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    };

    const initializeChatLogic = (data) => {
      const room = `group-${data.group.id}`;
      currentSocket = io({ query: { userId: data.user.id, username: data.user.username } });
      
      const messageContainer = document.getElementById('message-container');
      const userList = document.getElementById('user-list');
      const messageForm = document.getElementById('message-form');
      const messageInput = document.getElementById('message-input');
      const typingIndicator = document.getElementById('typing-indicator');
      let currentParentId = null;

      // Initial setup
      messageContainer.scrollTop = messageContainer.scrollHeight;
      if (document.querySelector('code')) hljs.highlightAll();
      
      // Sidebar toggle
      document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
          document.getElementById('chat-sidebar').classList.add('is-open');
          document.getElementById('sidebar-backdrop').classList.add('is-open');
      });
      document.getElementById('close-sidebar-btn').addEventListener('click', () => {
          document.getElementById('chat-sidebar').classList.remove('is-open');
          document.getElementById('sidebar-backdrop').classList.remove('is-open');
      });
       document.getElementById('sidebar-backdrop').addEventListener('click', () => {
          document.getElementById('chat-sidebar').classList.remove('is-open');
          document.getElementById('sidebar-backdrop').classList.remove('is-open');
      });

      // Socket Emitters
      currentSocket.emit('joinRoom', room);
      messageForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const message = messageInput.value.trim();
          if (message) {
              currentSocket.emit('chatMessage', { room, userId: currentUser.id, username: currentUser.username, message, parentId: currentParentId });
              messageInput.value = '';
              cancelReply();
          }
      });

      let typingTimeout;
      messageInput.addEventListener('input', () => {
        currentSocket.emit('typing', { room, username: currentUser.username });
        clearTimeout(typingTimeout);
      });

      // Socket Listeners
      currentSocket.on('updateUserList', (users) => { userList.innerHTML = users.map(user => `<li><i class="fas fa-circle text-green-500 text-xs mr-2"></i>${user}</li>`).join(''); });
      currentSocket.on('chatMessage', (msg) => {
          const div = document.createElement('div');
          div.innerHTML = buildMessageHtml(msg, data);
          messageContainer.appendChild(div.firstElementChild);
          messageContainer.scrollTop = messageContainer.scrollHeight;
          if (msg.is_code_snippet) hljs.highlightAll();
      });
      currentSocket.on('messageDeleted', (messageId) => {
          const msgEl = document.querySelector(`.message-bubble[data-message-id='${messageId}']`);
          if (msgEl) msgEl.remove();
      });
      currentSocket.on('typing', ({ username }) => {
        typingIndicator.textContent = `${username} is typing...`;
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => typingIndicator.textContent = '', 3000);
      });
      
      // ... Add all other chat logic (modals, clicks, etc.) here
    };

    // --- NAVIGATION ---
    const navigateTo = (path) => {
        window.history.pushState({}, '', path);
        router();
    };
    window.addEventListener('popstate', router);
    document.body.addEventListener('click', e => {
        const anchor = e.target.closest('a');
        if (anchor && anchor.getAttribute('href').startsWith('/') && anchor.target !== '_blank') {
            e.preventDefault();
            navigateTo(anchor.getAttribute('href'));
        }
    });

    // --- INITIALIZATION ---
    router();
});

