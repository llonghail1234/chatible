const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Phục vụ file tĩnh từ thư mục public
app.use(express.static('public'));

const rooms = new Map();
let waitingQueue = {
    male: [],
    female: [],
    any: []
};

io.on('connection', (socket) => {
    console.log('Người dùng kết nối');

    // Lưu thông tin người dùng
    let userName = '';
    let userGender = '';

    socket.on('save user info', (data) => {
        userName = data.name;
        userGender = data.gender;
        socket.emit('info saved', 'Thông tin đã được lưu!');
    });

    // Khi người dùng muốn bắt đầu chat
    socket.on('start chat', (userData) => {
        const { gender, searchGender } = userData;
        let partner = null;

        // Tìm kiếm đối tác phù hợp
        if (searchGender === 'any') {
            // Tìm trong tất cả hàng đợi
            if (waitingQueue.male.length > 0) {
                partner = waitingQueue.male.shift();
            } else if (waitingQueue.female.length > 0) {
                partner = waitingQueue.female.shift();
            } else if (waitingQueue.any.length > 0) {
                partner = waitingQueue.any.shift();
            }
        } else {
            // Tìm trong hàng đợi cụ thể
            if (waitingQueue[searchGender].length > 0) {
                partner = waitingQueue[searchGender].shift();
            }
        }

        if (partner && partner !== socket.id) { // Đảm bảo không tự kết nối
            const roomId = `room_${socket.id}_${partner}`;
            // Tham gia phòng và thông báo cho cả hai người dùng
            socket.join(roomId);
            io.to(partner).socketsJoin(roomId); // Đảm bảo đối tác tham gia phòng
            io.to(roomId).emit('chat started', {
                roomId: roomId,
                users: [socket.id, partner]
            });
        } else {
            // Nếu không tìm thấy đối tác, thêm vào hàng đợi
            waitingQueue[gender].push(socket.id);
            socket.emit('waiting for partner');
            console.log(`Người dùng ${socket.id} đang chờ đối tác...`);
        }
    });

    // Xử lý sự kiện join room
    socket.on('join room', (roomId) => {
        if (roomId) {
            socket.join(roomId); // Tham gia phòng
            console.log(`Người dùng ${socket.id} đã tham gia phòng ${roomId}`);
        }
    });

    // Khi người dùng rời phòng chat
    socket.on('leave room', (roomId) => {
        if (roomId) {
            io.to(roomId).emit('partner left');
            socket.leave(roomId);
        }
    });

    // Khi người dùng kết thúc chat
    socket.on('end chat', (roomId) => {
        if (roomId) {
            io.to(roomId).emit('chat ended');
            io.socketsLeave(roomId);
            // Thông báo cho đối tác rằng cuộc trò chuyện đã kết thúc
            socket.to(roomId).emit('partner left');
            // Xóa phòng chat
            delete rooms[roomId];
        }
    });

    // Gửi tin nhắn trong phòng
    socket.on('room message', (data) => {
        const { roomId, message } = data;
        console.log('Nhận tin nhắn từ client:', { roomId, message });
        io.to(roomId).emit('room message', {
            sender: userName,
            message: message
        });
    });

    // Khi người dùng ngắt kết nối
    socket.on('disconnect', () => {
        // Xóa khỏi hàng đợi nếu có
        waitingQueue.male = waitingQueue.male.filter(id => id !== socket.id);
        waitingQueue.female = waitingQueue.female.filter(id => id !== socket.id);
        waitingQueue.any = waitingQueue.any.filter(id => id !== socket.id);
        
        // Thông báo cho đối tác nếu đang trong phòng chat
        const rooms = Array.from(socket.rooms);
        rooms.forEach(room => {
            if (room !== socket.id) {
                socket.to(room).emit('partner left');
                io.socketsLeave(room);
            }
        });
    });
});

// Khởi động server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server đang chạy trên http://localhost:${PORT}`);
}); 