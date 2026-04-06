import { useState, useRef } from "react";
import * as XLSX from "xlsx";

export default function App() {
  const [mode, setMode] = useState("generate");
  const [gen, setGen] = useState({
    namePrefix: "vl", nameSuffix: "-cruser",
    vlanStart: 739, cruserStart: 751, count: 10,
    ipBase: "192.168.205", ipStart: 38, ipStep: 2,
    allowaccess: "ping", aliasPrefix: "cruser",
    parentInterface: "port2",
  });
  const [rows, setRows] = useState([]);
  const [script, setScript] = useState("");
  const [showScript, setShowScript] = useState(false);
  const fileInputRef = useRef();
  const scriptRef = useRef();

  const buildRows = () => {
    const out = [];
    for (let i = 0; i < gen.count; i++) {
      const vlanid = gen.vlanStart + i;
      const cruser = gen.cruserStart + i;
      const rawIp = gen.ipStart + i * gen.ipStep;
      const parts = gen.ipBase.split(".");
      let oct3 = parseInt(parts[2]), oct4 = rawIp;
      if (oct4 > 255) { oct3 += Math.floor(oct4 / 256); oct4 = oct4 % 256; }
      out.push({
        name: `${gen.namePrefix}${vlanid}${gen.nameSuffix}${cruser}`,
        vlanid, ip: `${parts[0]}.${parts[1]}.${oct3}.${oct4} 255.255.255.254`,
        allowaccess: gen.allowaccess || "ping",
        alias: `${gen.aliasPrefix}${cruser}`,
        interface: gen.parentInterface,
        vdom: "root",
      });
    }
    return out;
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (data.length < 2) return;
      const hdrs = data[0].map(h => String(h).trim().toLowerCase());
      const idx = (keys) => { for (const k of keys) { const i = hdrs.findIndex(h=>h.includes(k)); if(i>=0) return i; } return -1; };
      const ni=idx(["name"]), vi=idx(["vlanid","vlan id","vlan"]), ii=idx(["ip"]), ai=idx(["access"]), ali=idx(["alias"]), ifi=idx(["interface","父"]);
      const mapped = data.slice(1).filter(r=>r.some(c=>c)).map(r => ({
        name: String(r[ni]??'').trim(),
        vlanid: parseInt(r[vi]),
        ip: String(r[ii]??'').trim(),
        allowaccess: ai>=0 ? String(r[ai]??gen.allowaccess).trim()||gen.allowaccess : gen.allowaccess,
        alias: ali>=0 ? String(r[ali]??'').trim() : '',
        interface: ifi>=0 ? String(r[ifi]??gen.parentInterface).trim() : gen.parentInterface,
        vdom: "root",
      })).filter(r=>r.name&&r.vlanid&&r.ip);
      setRows(mapped);
    };
    reader.readAsArrayBuffer(file);
  };

  const finalRows = mode === "generate" ? buildRows() : rows;

  const generateScript = () => {
    const s = `// FortiGate VLAN Batch Creator — ${finalRows.length} 個接口
// 在 FortiGate 頁面 F12 > Console 貼上執行
(async () => {
  const csrf = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ccsrftoken'));
  const token = csrf ? csrf.split('=')[1].replace(/"/g,'') : '';
  const payloads = ${JSON.stringify(finalRows, null, 2)};
  let ok=0, fail=[];
  for (const p of payloads) {
    const r = await fetch('/api/v2/cmdb/system/interface', {
      method: 'POST', credentials: 'include',
      headers: {'Content-Type':'application/json','X-CSRFTOKEN':token},
      body: JSON.stringify(p)
    });
    const d = await r.json();
    if (d.status==='success') { ok++; console.log('✅', p.name); }
    else { fail.push(p.name); console.error('❌', p.name, d.cli_error||JSON.stringify(d)); }
  }
  console.log(\`\\n完成：✅ \${ok} 成功  ❌ \${fail.length} 失敗\`);
  if (fail.length) console.log('失敗:', fail.join(', '));
})();`;
    setScript(s);
    setShowScript(true);
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["name","vlanid","ip","allowaccess","alias"],
      ...finalRows.map(r=>[r.name,r.vlanid,r.ip,r.allowaccess,r.alias])
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "VLANs");
    XLSX.writeFile(wb, "fortigate_vlans.xlsx");
  };

  const fields = [
    ["名稱前綴","namePrefix","text"],["名稱中綴","nameSuffix","text"],
    ["VLAN ID 起始","vlanStart","number"],["序號起始","cruserStart","number"],
    ["IP 網段（前三段）","ipBase","text"],["IP 起始（最後一段）","ipStart","number"],
    ["IP 步進（/31=2）","ipStep","number"],["生成數量","count","number"],
    ["allowaccess","allowaccess","text"],["alias 前綴","aliasPrefix","text"],
    ["父接口","parentInterface","text"],
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-white rounded-xl shadow p-5">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl">🔥</span>
            <h1 className="text-xl font-bold text-gray-800">FortiGate VLAN 批量創建工具</h1>
          </div>
          <p className="text-xs text-gray-400 ml-9">生成腳本 → 複製 → FortiGate F12 Console 貼上執行</p>
        </div>

        {/* Mode toggle */}
        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {[["generate","⚡ 自動生成"],["upload","📂 上傳 Excel/CSV"]].map(([m,l])=>(
              <button key={m} onClick={()=>{setMode(m);setShowScript(false);}}
                className={`flex-1 py-2 font-medium transition-colors ${mode===m?"bg-blue-600 text-white":"bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {l}
              </button>
            ))}
          </div>

          {mode==="generate" && (
            <div className="grid grid-cols-2 gap-3">
              {fields.map(([label,key,type])=>(
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-1">{label}</label>
                  <input type={type}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={gen[key]}
                    onChange={e=>setGen(g=>({...g,[key]:type==="number"?(parseInt(e.target.value)||0):e.target.value}))}
                  />
                </div>
              ))}
            </div>
          )}

          {mode==="upload" && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50"
                onClick={()=>fileInputRef.current?.click()}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}>
                <div className="text-3xl mb-1">📂</div>
                <p className="text-sm text-gray-500">點擊或拖放 .xlsx / .xls / .csv</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e=>handleFile(e.target.files[0])} />
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                欄位標題（第一行）：<code>name | vlanid | ip | allowaccess | alias</code>
              </p>
              {rows.length>0 && <p className="text-sm text-green-700 bg-green-50 rounded p-2">✅ 已讀取 {rows.length} 行</p>}
            </div>
          )}
        </div>

        {/* Preview */}
        {finalRows.length>0 && (
          <div className="bg-white rounded-xl shadow p-4 space-y-2">
            <p className="text-sm font-medium text-gray-600">預覽（共 {finalRows.length} 個）</p>
            <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1 max-h-36 overflow-y-auto">
              {finalRows.slice(0,3).map((r,i)=>(
                <div key={i} className="flex gap-3">
                  <span className="text-blue-500 w-4">{i+1}.</span>
                  <span className="text-gray-800">{r.name}</span>
                  <span className="text-gray-400">vlan{r.vlanid}</span>
                  <span className="text-green-600">{r.ip}</span>
                </div>
              ))}
              {finalRows.length>3 && <div className="text-gray-400 pl-7">... 還有 {finalRows.length-3} 行</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={generateScript}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm font-medium">
                📄 生成腳本
              </button>
              <button onClick={downloadExcel}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm hover:bg-gray-50">
                ⬇ Excel
              </button>
            </div>
          </div>
        )}

        {/* Script output — 全選複製 */}
        {showScript && script && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">📋 腳本已生成 — 全選後複製</p>
              <span className="text-xs text-gray-400">Ctrl+A → Ctrl+C</span>
            </div>

            {/* 操作步驟 */}
            <div className="bg-blue-50 rounded p-3 text-xs text-blue-800 space-y-1">
              <p>1️⃣ 點一下下方文字框</p>
              <p>2️⃣ 按 <kbd className="bg-blue-100 px-1 rounded font-mono">Ctrl+A</kbd> 全選</p>
              <p>3️⃣ 按 <kbd className="bg-blue-100 px-1 rounded font-mono">Ctrl+C</kbd> 複製</p>
              <p>4️⃣ 切到 FortiGate 頁面 → <kbd className="bg-blue-100 px-1 rounded font-mono">F12</kbd> → Console → 貼上 → Enter</p>
            </div>

            <textarea
              ref={scriptRef}
              readOnly
              value={script}
              onClick={e => e.target.select()}
              rows={14}
              className="w-full font-mono text-xs bg-gray-900 text-green-400 rounded p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-text"
            />
            <p className="text-xs text-gray-400 text-center">點擊文字框會自動全選</p>
          </div>
        )}

      </div>
    </div>
  );
}
