Initially clone this repository
Then, go to betacrew_exchange_server directory, now open terminal and run : "node main.js".
This would create a TCP connection
Keep this connection running and open another terminal , then go to Node client directory .
In this directory , use "npm i" to install node modules , once they are done , run command : "node server.js" to create a connection with tcp and get data.
You can delete "output.json" file and rerun the server to again see new created output.json file
