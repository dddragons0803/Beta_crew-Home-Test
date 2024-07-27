const net = require('net');
const fs = require('fs');

// Server details
const HOST = 'localhost';
const PORT = 3000;

// Function to convert a buffer to an integer (Big Endian)
function bufferToInt(buffer) {
    if (buffer.length !== 4) {
        throw new Error(`Invalid buffer length: ${buffer.length}`);
    }
    return buffer.readUInt32BE(0);
}

// Function to create a request payload
function createPayload(callType, resendSeq = 0) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(callType, 0);
    buffer.writeUInt8(resendSeq, 1);
    return buffer;
}

// Function to handle received packets
function handlePacket(packet) {
    if (packet.length !== 17) {
        throw new Error(`Invalid packet length: ${packet.length}`);
    }
    const symbol = packet.slice(0, 4).toString('ascii');
    const buySellIndicator = packet.slice(4, 5).toString('ascii');
    const quantity = bufferToInt(packet.slice(5, 9));
    const price = bufferToInt(packet.slice(9, 13));
    const sequence = bufferToInt(packet.slice(13, 17));

    if (!symbol || !['B', 'S'].includes(buySellIndicator) || quantity <= 0 || price <= 0 || sequence < 0) {
        throw new Error('Invalid packet data');
    }

    return { symbol, buySellIndicator, quantity, price, sequence };
}

// Function to fetch all packets from the server
function fetchAllPackets() {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ host: HOST, port: PORT }, () => {
            console.log('Connected to server for fetching all packets');
            const payload = createPayload(1); // Call Type 1: Stream All Packets
            client.write(payload);
        });

        let dataBuffer = Buffer.alloc(0);

        client.on('data', (data) => {
            console.log('Received data from server');
            dataBuffer = Buffer.concat([dataBuffer, data]);
        });

        client.on('end', () => {
            console.log('Connection ended by server');
            resolve(dataBuffer);
        });

        client.on('error', (err) => {
            console.error('Network error:', err.message);
            reject(err);
        });

        client.on('timeout', () => {
            console.warn('Connection timeout');
            client.end();
        });
    });
}

// Function to fetch a missing packet from the server
function fetchMissingPacket(sequence) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection({ host: HOST, port: PORT }, () => {
            console.log(`Requesting missing packet with sequence: ${sequence}`);
            const payload = createPayload(2, sequence); // Call Type 2: Resend Packet
            client.write(payload);
        });

        client.on('data', (data) => {
            console.log(`Received missing packet with sequence: ${sequence}`);
            resolve(data);
            client.end();
        });

        client.on('error', (err) => {
            console.error(`Network error while fetching packet ${sequence}:`, err.message);
            reject(err);
        });

        client.on('timeout', () => {
            console.warn(`Connection timeout while fetching packet ${sequence}`);
            client.end();
        });
    });
}

// Main function to execute the client logic
(async () => {
    try {
        const dataBuffer = await fetchAllPackets();
        console.log('Fetched all packets from server');
        
        const packets = [];
        const packetSize = 17; // Each packet is 17 bytes

        for (let i = 0; i < dataBuffer.length; i += packetSize) {
            const packet = dataBuffer.slice(i, i + packetSize);
            try {
                packets.push(handlePacket(packet));
            } catch (error) {
                console.error('Error handling packet:', error.message);
            }
        }

        // Check for missing sequences
        const sequences = packets.map(packet => packet.sequence).sort((a, b) => a - b);
        const missingSequences = [];

        for (let i = sequences[0]; i <= sequences[sequences.length - 1]; i++) {
            if (!sequences.includes(i)) {
                missingSequences.push(i);
            }
        }

        // Fetch missing packets
        for (const seq of missingSequences) {
            try {
                const missingPacketData = await fetchMissingPacket(seq);
                packets.push(handlePacket(missingPacketData));
            } catch (error) {
                console.error(`Error fetching missing packet ${seq}:`, error.message);
            }
        }

        // Sort packets by sequence number
        packets.sort((a, b) => a.sequence - b.sequence);

        // Write packets to JSON file
        fs.writeFileSync('output.json', JSON.stringify(packets, null, 2));
        console.log('Output written to output.json');
    } catch (err) {
        console.error('Error:', err.message);
    }
})();
