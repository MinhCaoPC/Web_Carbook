const http = require('http');
http.get('http://localhost:5050/api/admin/vehicles/XE001', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(JSON.parse(data));
    process.exit(0);
  });
});
