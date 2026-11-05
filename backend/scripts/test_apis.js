const http = require('http');

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log("=== START INTEGRATION TEST ===");

  // 1. Post to Bulk Create
  const bulkPayload = {
    maLoTrinh: "LT001",
    maLoaiXe: "Limousine",
    khungGioXuatBenGoc: ["08:00", "10:00"],
    kieuPhanBo: "TuDongTheoDoi",
    tuNgay: "2026-07-20",
    denNgay: "2026-07-22",
    cacThuTrongTuan: [2, 3, 4, 5, 6, 7, 8],
    tanSuat: "HangNgay"
  };

  console.log("\n1. Testing POST /api/admin/trips/bulk...");
  const bulkRes = await postJSON("http://localhost:5050/api/admin/trips/bulk", bulkPayload);
  console.log("Status Code:", bulkRes.statusCode);
  console.log("Response Data:", JSON.stringify(bulkRes.data, null, 2));

  // 2. Fetch Timeline Trips
  console.log("\n2. Testing GET /api/admin/trips?date=2026-07-20...");
  const getRes = await getJSON("http://localhost:5050/api/admin/trips?date=2026-07-20");
  console.log("Status Code:", getRes.statusCode);
  console.log(`Found ${getRes.data?.trips?.length || 0} trips on 2026-07-20.`);
  if (getRes.data?.trips?.length > 0) {
    console.log("First Trip Data Sample:", JSON.stringify(getRes.data.trips[0], null, 2));
  }

  // 3. Test Conflict Avoidance (Running creation again with same slots should produce conflicts)
  console.log("\n3. Testing Conflict Avoidance by resubmitting same config...");
  const conflictRes = await postJSON("http://localhost:5050/api/admin/trips/bulk", bulkPayload);
  console.log("Status Code:", conflictRes.statusCode);
  console.log("Response Data (Should show soXungDot > 0 and soChuyenTao == 0):");
  console.log(`soChuyenTao: ${conflictRes.data?.soChuyenTao}, soXungDot: ${conflictRes.data?.soXungDot}`);
  console.log("Conflicts:", JSON.stringify(conflictRes.data?.danhSachXungDot, null, 2));

  console.log("\n=== TEST CONCLUDED ===");
}

main().catch(console.error);
