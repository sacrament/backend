module.exports = class ChatService {
    constructor(io) {
        this.io = io; 
    }

    isUserConnected(user, checkStatus = true) {
        return new Promise((resolve) => {
            this.io.in(user).clients((err, clients) => {
                if (err) return resolve(false);

                if (clients.length === 0) return resolve(false);
                
                // resolve(clients.length > 0 ? true : false); 
                const socketId = clients[0];
                const socket = this.io.sockets[socketId];

                if (socket) {
                    if (checkStatus) {
                        var sent;

                        setTimeout(() => {
                            if (!sent) {
                                console.warn(`User lost connection : ${user}`);
                                resolve(false);
                            }
                        }, 2500);
    
                        socket.emit('check status', (answer) => {
                            sent = true;
                            resolve(true); 
                        });
                    } else {
                        resolve(true);
                    }
                } else {
                    resolve(false);
                }
            });
        }) 
    }
}  