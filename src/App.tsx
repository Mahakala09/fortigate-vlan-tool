import { useState, useRef } from "react";
import * as XLSX from "xlsx";

// ── Types ─────────────────────────────────────────────────────
interface VlanRow {
  name: string; vlanid: number; ip: string;
  allowaccess: string; alias: string; interface: string; vdom: string;
}
interface VipRow {
  name: string; type: string; extip: string; extintf: string;
  portforward: string; protocol: string; extport: string;
  mappedport: string; mappedip: { range: string }[];
}
interface GenState {
  namePrefix: string; nameSuffix: string; vlanStart: number;
  cruserStart: number; count: number; ipBase: string; ipStart: number;
  ipStep: number; allowaccess: string; aliasPrefix: string; parentInterface: string;
  [key: string]: string | number;
}
interface VipGenState {
  namePrefix: string; nameSuffix: string; cruserStart: number; vlanStart: number;
  count: number; extip: string; extportStart: number; extportStep: number;
  mappedipFull: string; mappedipStep: number; mappedport: number;
  portforward: string; protocol: string; extintf: string;
  [key: string]: string | number;
}
interface AccessState { [key: string]: boolean }

const ACCESS_OPTIONS = ["ping","https","http","ssh","fgfm","snmp"];
const TABS = [{ id:"vlan", label:"🌐 VLAN 接口" }, { id:"vip", label:"🔀 虛擬IP (VIP)" }];

export default function App() {
  const [tab,    setTab]    = useState("vlan");
  const [action, setAction] = useState("create");
  const [mode,   setMode]   = useState("generate");

  const [gen, setGen] = useState<GenState>({
    namePrefix:"vl", nameSuffix:"-cruser",
    vlanStart:739, cruserStart:751, count:10,
    ipBase:"192.168.205", ipStart:38, ipStep:2,
    allowaccess:"ping", aliasPrefix:"cruser", parentInterface:"port2",
  });
  const [newAccess, setNewAccess] = useState<AccessState>({
    ping:true, https:false, http:false, ssh:false, fgfm:false, snmp:false
  });
  const [vipGen, setVipGen] = useState<VipGenState>({
    namePrefix:"cruser", nameSuffix:"-vlan",
    cruserStart:79, vlanStart:256, count:10,
    extip:"58.84.8.91", extportStart:57078, extportStep:1,
    mappedipFull:"192.168.201.117", mappedipStep:2, mappedport:3389,
    portforward:"enable", protocol:"tcp", extintf:"port5",
  });

  const [rows,       setRows]       = useState<VlanRow[] | VipRow[]>([]);
  const [script,     setScript]     = useState("");
  const [showScript, setShowScript] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleAccess = (k: string) => setNewAccess(a => ({ ...a, [k]: !a[k] }));
  const accessStr = Object.entries(newAccess).filter(([,v])=>v).map(([k])=>k).join(" ");

  // ── VLAN builder ───────────────────────────────────────────
  const buildVlanRows = (): VlanRow[] => {
    const out: VlanRow[] = [];
    for (let i = 0; i < gen.count; i++) {
      const vlanid = gen.vlanStart + i, cruser = gen.cruserStart + i;
      const rawIp = gen.ipStart + i * gen.ipStep;
      const parts = gen.ipBase.split(".");
      let oct3 = parseInt(parts[2]), oct4 = rawIp;
      if (oct4 > 255) { oct3 += Math.floor(oct4/256); oct4 = oct4%256; }
      out.push({
        name: `${gen.namePrefix}${vlanid}${gen.nameSuffix}${cruser}`,
        vlanid, ip: `${parts[0]}.${parts[1]}.${oct3}.${oct4} 255.255.255.254`,
        allowaccess: gen.allowaccess || "ping",
        alias: `${gen.aliasPrefix}${cruser}`,
        interface: gen.parentInterface, vdom: "root",
      });
    }
    return out;
  };

  // ── VIP builder ────────────────────────────────────────────
  const buildVipRows = (): VipRow[] => {
    const out: VipRow[] = [];
    const parts = vipGen.mappedipFull.trim().split(".");
    if (parts.length !== 4) return out;
    const oct1 = parseInt(parts[0]), oct2 = parseInt(parts[1]);
    const baseOct3 = parseInt(parts[2]), baseOct4 = parseInt(parts[3]);
    for (let i = 0; i < vipGen.count; i++) {
      const cruser = vipGen.cruserStart + i, vlan = vipGen.vlanStart + i;
      const extport = vipGen.extportStart + i * vipGen.extportStep;
      const rawOct4 = baseOct4 + i * vipGen.mappedipStep;
      const oct3 = baseOct3 + Math.floor(rawOct4/256);
      const oct4 = rawOct4 % 256;
      const mappedip = `${oct1}.${oct2}.${oct3}.${oct4}`;
      const baseName = `${vipGen.namePrefix}${cruser}${vipGen.nameSuffix}${vlan}`;
      const base = {
        type: "static-nat", extip: vipGen.extip, extintf: vipGen.extintf,
        portforward: "enable",
        extport: String(extport), mappedport: String(vipGen.mappedport),
        mappedip: [{ range: mappedip }],
      };
      if (vipGen.protocol === "both") {
        out.push({ ...base, name: `${baseName}-tcp`, protocol: "tcp" });
        out.push({ ...base, name: `${baseName}-udp`, protocol: "udp" });
      } else {
        out.push({ ...base, name: baseName, protocol: vipGen.protocol });
      }
    }
    return out;
  };

  // ── File upload ────────────────────────────────────────────
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      const result = e.target?.result;
      if (!result) return;
      const wb = XLSX.read(result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
      if (data.length < 2) return;
      const hdrs = (data[0] as unknown[]).map(h => String(h).trim().toLowerCase());
      const idx = (...keys: string[]) => {
        for (const k of keys) { const i = hdrs.findIndex(h => h.includes(k)); if (i >= 0) return i; } return -1;
      };
      if (tab === "vlan") {
        const ni=idx("name"), vi=idx("vlanid","vlan"), ii=idx("ip"), ai=idx("access"), ali=idx("alias"), ifi=idx("interface","父");
        const mapped: VlanRow[] = data.slice(1)
          .filter(r => (r as unknown[]).some(c => c))
          .map(r => {
            const row = r as unknown[];
            return {
              name:        String(row[ni] ?? "").trim(),
              vlanid:      parseInt(String(row[vi] ?? "0")),
              ip:          String(row[ii] ?? "").trim(),
              allowaccess: ai  >= 0 ? String(row[ai]  ?? gen.allowaccess).trim() || gen.allowaccess : gen.allowaccess,
              alias:       ali >= 0 ? String(row[ali] ?? "").trim() : "",
              interface:   ifi >= 0 ? String(row[ifi] ?? gen.parentInterface).trim() : gen.parentInterface,
              vdom: "root",
            };
          })
          .filter(r => r.name && (action !== "create" || (r.vlanid && r.ip)));
        setRows(mapped);
      } else {
        const ni=idx("name"), ei=idx("extip"), epi=idx("extport"), mi=idx("mappedip"), mpi=idx("mappedport"), inti=idx("extintf","intf");
        const mapped: VipRow[] = data.slice(1)
          .filter(r => (r as unknown[]).some(c => c))
          .map(r => {
            const row = r as unknown[];
            return {
              name:       String(row[ni] ?? "").trim(),
              type:       "static-nat",
              extip:      ei   >= 0 ? String(row[ei]  ?? vipGen.extip).trim()   : vipGen.extip,
              extintf:    inti >= 0 ? String(row[inti] ?? vipGen.extintf).trim() : vipGen.extintf,
              portforward: "enable",
              protocol:   "tcp",
              extport:    epi  >= 0 ? String(row[epi]  ?? "").trim() : "",
              mappedport: mpi  >= 0 ? String(row[mpi]  ?? vipGen.mappedport).trim() : String(vipGen.mappedport),
              mappedip:   [{ range: mi >= 0 ? String(row[mi] ?? "").trim() : "" }],
            };
          })
          .filter(r => r.name);
        setRows(mapped);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const finalRows = mode === "generate" ? (tab === "vlan" ? buildVlanRows() : buildVipRows()) : rows;
  const names = finalRows.map(r => r.name);

  // ── Script builder ─────────────────────────────────────────
  const generateScript = () => {
    const csrf = `const csrf=document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('ccsrftoken'));
  const token=csrf?csrf.split('=')[1].replace(/"/g,''):'';`;
    const vlanEp = "/api/v2/cmdb/system/interface";
    const vipEp  = "/api/v2/cmdb/firewall/vip";
    let s = "";

    if (action === "create" && tab === "vlan") {
      s = `(async()=>{
  ${csrf}
  const payloads=${JSON.stringify(finalRows,null,2)};
  let ok=0,fail=[];
  for(const p of payloads){
    const r=await fetch('${vlanEp}',{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','X-CSRFTOKEN':token},
      body:JSON.stringify(p)
    });
    const d=await r.json();
    if(d.status==='success'){ok++;console.log('✅ 創建',p.name);}
    else{fail.push(p.name);console.error('❌',p.name,d.cli_error||JSON.stringify(d));}
  }
  console.log(\`\\n完成：✅ \${ok} 成功  ❌ \${fail.length} 失敗\`);
  if(fail.length)console.log('失敗:',fail.join(', '));
})();`;

    } else if (action === "create" && tab === "vip") {
      s = `(async()=>{
  ${csrf}
  const payloads=${JSON.stringify(finalRows,null,2)};
  let ok=0,fail=[];
  console.log('🔍 測試第一條:', payloads[0].name);
  const testR=await fetch('${vipEp}',{
    method:'POST',credentials:'include',
    headers:{'Content-Type':'application/json','X-CSRFTOKEN':token},
    body:JSON.stringify(payloads[0])
  });
  const testD=await testR.json();
  console.log('第一條結果:', JSON.stringify(testD));
  if(testD.status!=='success'){
    console.error('❌ 第一條失敗，停止。錯誤:',testD.cli_error||JSON.stringify(testD));
    return;
  }
  ok++;
  for(const p of payloads.slice(1)){
    const r=await fetch('${vipEp}',{
      method:'POST',credentials:'include',
      headers:{'Content-Type':'application/json','X-CSRFTOKEN':token},
      body:JSON.stringify(p)
    });
    const d=await r.json();
    if(d.status==='success'){ok++;console.log('✅',p.name);}
    else{fail.push(p.name);console.error('❌',p.name,d.cli_error||JSON.stringify(d));}
  }
  console.log(\`\\n完成：✅ \${ok} 成功  ❌ \${fail.length} 失敗\`);
  if(fail.length)console.log('失敗:',fail.join(', '));
})();`;

    } else if (action === "delete") {
      const ep = tab === "vlan" ? vlanEp : vipEp;
      s = `(async()=>{
  ${csrf}
  const names=${JSON.stringify(names,null,2)};
  let ok=0,fail=[];
  for(const name of names){
    const r=await fetch('${ep}/'+encodeURIComponent(name),{
      method:'DELETE',credentials:'include',
      headers:{'Content-Type':'application/json','X-CSRFTOKEN':token}
    });
    const d=await r.json();
    if(d.status==='success'){ok++;console.log('✅ 刪除',name);}
    else{fail.push(name);console.error('❌',name,d.cli_error||JSON.stringify(d));}
  }
  console.log(\`\\n完成：✅ \${ok} 成功  ❌ \${fail.length} 失敗\`);
  if(fail.length)console.log('失敗:',fail.join(', '));
})();`;

    } else { // modify
      s = `(async()=>{
  ${csrf}
  const names=${JSON.stringify(names,null,2)};
  const newAccess=${JSON.stringify(accessStr)};
  let ok=0,fail=[];
  for(const name of names){
    const r=await fetch('${vlanEp}/'+encodeURIComponent(name),{
      method:'PUT',credentials:'include',
      headers:{'Content-Type':'application/json','X-CSRFTOKEN':token},
      body:JSON.stringify({allowaccess:newAccess})
    });
    const d=await r.json();
    if(d.status==='success'){ok++;console.log('✅ 修改',name,'→',newAccess||'(空)');}
    else{fail.push(name);console.error('❌',name,d.cli_error||JSON.stringify(d));}
  }
  console.log(\`\\n完成：✅ \${ok} 成功  ❌ \${fail.length} 失敗\`);
  if(fail.length)console.log('失敗:',fail.join(', '));
})();`;
    }
    setScript(s); setShowScript(true);
  };

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    let rows_data: (string|number)[][];
    if (tab === "vlan") {
      rows_data = [["name","vlanid","ip","allowaccess","alias"],
        ...(finalRows as VlanRow[]).map(r => [r.name, r.vlanid, r.ip, r.allowaccess, r.alias])];
    } else {
      rows_data = [["name","extip","extport","mappedip","mappedport","extintf"],
        ...(finalRows as VipRow[]).map(r => [r.name, r.extip, r.extport, r.mappedip[0]?.range, r.mappedport, r.extintf])];
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows_data), "Sheet1");
    XLSX.writeFile(wb, `fortigate_${tab}.xlsx`);
  };

  const AC: Record<string,{label:string;color:string;warn:string|null}> = {
    create: { label:"➕ 批量創建", color:"blue",  warn:null },
    delete: { label:"🗑️ 批量刪除", color:"red",   warn:"刪除操作不可逆！" },
    modify: { label:"✏️ 批量修改", color:"amber", warn:null },
  };
  const btnCls: Record<string,string> = {
    blue:"bg-blue-600 hover:bg-blue-700",
    red:"bg-red-600 hover:bg-red-700",
    amber:"bg-amber-500 hover:bg-amber-600"
  };
  const ac = AC[action];

  const vlanCreateFields: [string,string,string][] = [
    ["名稱前綴","namePrefix","text"],["名稱中綴","nameSuffix","text"],
    ["VLAN ID 起始","vlanStart","number"],["序號起始（cruser）","cruserStart","number"],
    ["IP 網段（前三段）","ipBase","text"],["IP 起始（最後一段）","ipStart","number"],
    ["IP 步進（/31=2）","ipStep","number"],["數量","count","number"],
    ["allowaccess","allowaccess","text"],["alias 前綴","aliasPrefix","text"],
    ["父接口","parentInterface","text"],
  ];
  const vlanNameFields: [string,string,string][] = [
    ["名稱前綴","namePrefix","text"],["名稱中綴","nameSuffix","text"],
    ["VLAN ID 起始","vlanStart","number"],["序號起始（cruser）","cruserStart","number"],
    ["數量","count","number"],
  ];
  const vipCreateFields: [string,string,string][] = [
    ["名稱前綴","namePrefix","text"],["名稱中綴","nameSuffix","text"],
    ["cruser 起始","cruserStart","number"],["VLAN 起始","vlanStart","number"],
    ["數量","count","number"],["外部 IP (extip)","extip","text"],
    ["外部端口起始","extportStart","number"],["外部端口步進","extportStep","number"],
    ["目標 IP 起始（完整 IP）","mappedipFull","text"],["目標 IP 步進","mappedipStep","number"],
    ["目標端口","mappedport","number"],["外部接口 (extintf)","extintf","text"],
  ];
  const vipNameFields: [string,string,string][] = [
    ["名稱前綴","namePrefix","text"],["名稱中綴","nameSuffix","text"],
    ["cruser 起始","cruserStart","number"],["VLAN 起始","vlanStart","number"],
    ["數量","count","number"],
  ];

  const renderGenFields = (fields: [string,string,string][], state: GenState|VipGenState, setter: (v: GenState|VipGenState) => void) => (
    <div className="grid grid-cols-2 gap-3">
      {fields.map(([label,key,type]) => (
        <div key={key}>
          <label className="block text-xs text-gray-500 mb-1">{label}</label>
          <input type={type}
            className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={state[key] as string|number}
            onChange={e => setter({ ...state, [key]: type==="number" ? (parseInt(e.target.value)||0) : e.target.value })}
          />
        </div>
      ))}
      {/* Protocol selector for VIP create */}
      {tab==="vip" && action==="create" && (
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">協議 (protocol)</label>
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {([["tcp","TCP 只"],["udp","UDP 只"],["both","TCP + UDP（各建一條）"]] as [string,string][]).map(([v,l]) => (
              <button key={v} type="button"
                onClick={() => setVipGen(g => ({ ...g, protocol: v }))}
                className={`flex-1 py-1.5 font-medium transition-colors border-r last:border-r-0
                  ${vipGen.protocol===v ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {l}
              </button>
            ))}
          </div>
          {vipGen.protocol==="both" && (
            <p className="text-xs text-blue-600 mt-1">
              ⚡ 每個 VIP 生成 2 條（-tcp / -udp），共 {vipGen.count * 2} 條
            </p>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="bg-white rounded-xl shadow p-5 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <div>
            <h1 className="text-xl font-bold text-gray-800">FortiGate 批量管理工具</h1>
            <p className="text-xs text-gray-400">生成腳本 → FortiGate F12 Console 貼上執行</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-4 space-y-4">
          {/* Tab */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {TABS.map(t => (
              <button key={t.id}
                onClick={() => { setTab(t.id); setRows([]); setShowScript(false); setAction("create"); setMode("generate"); }}
                className={`flex-1 py-2 font-medium transition-colors ${tab===t.id ? "bg-gray-800 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Action */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {Object.entries(AC).filter(([k]) => !(tab==="vip" && k==="modify")).map(([k,cfg]) => (
              <button key={k} onClick={() => { setAction(k); setShowScript(false); }}
                className={`flex-1 py-2 font-medium transition-colors border-r last:border-r-0
                  ${action===k ? `${btnCls[cfg.color]} text-white` : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {cfg.label}{action===k && " ✓"}
              </button>
            ))}
          </div>

          {/* Current action reminder */}
          <div className={`text-xs font-medium px-3 py-1.5 rounded-lg
            ${action==="create" ? "bg-blue-50 text-blue-700" : action==="delete" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
            目前模式：{ac.label} →
            {action==="create" ? " POST（新增）" : action==="delete" ? " DELETE（刪除）" : " PUT（修改 allowaccess）"}
          </div>

          {ac.warn && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">⚠️ <strong>{ac.warn}</strong></div>}

          {/* Modify allowaccess */}
          {tab==="vlan" && action==="modify" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800">設定新的 allowaccess（可多選）</p>
              <div className="flex flex-wrap gap-2">
                {ACCESS_OPTIONS.map(opt => (
                  <label key={opt} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer text-sm font-medium select-none
                    ${newAccess[opt] ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-600 border-gray-300 hover:border-amber-400"}`}>
                    <input type="checkbox" className="hidden" checked={!!newAccess[opt]} onChange={() => toggleAccess(opt)} />
                    {newAccess[opt] ? "✓" : "+"} {opt}
                  </label>
                ))}
              </div>
              <div className="text-xs text-amber-700 bg-amber-100 rounded px-3 py-1.5 font-mono">
                allowaccess = "{accessStr || "(空白)"}"
              </div>
            </div>
          )}

          {/* Mode toggle */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            {([["generate","⚡ 自動生成"],["upload","📂 上傳 Excel/CSV"]] as [string,string][]).map(([m,l]) => (
              <button key={m} onClick={() => { setMode(m); setShowScript(false); }}
                className={`flex-1 py-2 font-medium transition-colors ${mode===m ? "bg-gray-700 text-white" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Generate fields */}
          {mode==="generate" && tab==="vlan" && renderGenFields(
            action==="create" ? vlanCreateFields : vlanNameFields,
            gen, v => setGen(v as GenState)
          )}
          {mode==="generate" && tab==="vip" && renderGenFields(
            action==="create" ? vipCreateFields : vipNameFields,
            vipGen, v => setVipGen(v as VipGenState)
          )}

          {/* Upload */}
          {mode==="upload" && (
            <div className="space-y-3">
              <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if(f) handleFile(f); }}>
                <div className="text-3xl mb-1">📂</div>
                <p className="text-sm text-gray-500">點擊或拖放 .xlsx / .xls / .csv</p>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if(f) handleFile(f); }} />
              </div>
              <p className="text-xs text-gray-400 bg-gray-50 rounded p-2">
                {tab==="vlan"
                  ? action==="create" ? "欄位：name | vlanid | ip | allowaccess | alias" : "只需要 name 欄"
                  : action==="create" ? "欄位：name | extip | extport | mappedip | mappedport | extintf" : "只需要 name 欄"}
              </p>
              {rows.length > 0 && <p className="text-sm text-green-700 bg-green-50 rounded p-2">✅ 已讀取 {rows.length} 行</p>}
            </div>
          )}
        </div>

        {/* Preview */}
        {finalRows.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <p className="text-sm font-medium text-gray-600">
              預覽（{finalRows.length} 個 →
              <span className={action==="create" ? " text-blue-600" : action==="delete" ? " text-red-600" : " text-amber-600"}>
                {action==="create" ? " 創建" : action==="delete" ? " 刪除" : ` allowaccess="${accessStr||"空"}"`}
              </span>）
            </p>
            <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1 max-h-40 overflow-y-auto">
              {finalRows.slice(0,5).map((r,i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className={`w-4 text-center ${action==="create"?"text-blue-500":action==="delete"?"text-red-500":"text-amber-500"}`}>
                    {action==="create"?"➕":action==="delete"?"🗑️":"✏️"}
                  </span>
                  <span className="font-medium text-gray-800">{r.name}</span>
                  {tab==="vlan" && action==="create" && (
                    <><span className="text-gray-400">vlan{(r as VlanRow).vlanid}</span><span className="text-green-600">{(r as VlanRow).ip}</span></>
                  )}
                  {tab==="vip" && action==="create" && (
                    <><span className="text-gray-400">{(r as VipRow).extip}:{(r as VipRow).extport}</span><span className="text-green-600">→ {(r as VipRow).mappedip[0]?.range}:{(r as VipRow).mappedport}</span></>
                  )}
                </div>
              ))}
              {finalRows.length > 5 && <div className="text-gray-400 pl-6">... 還有 {finalRows.length-5} 行</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={generateScript}
                className={`flex-1 py-2 rounded text-white text-sm font-medium ${btnCls[ac.color]}`}>
                📄 生成腳本（{finalRows.length} 個）
              </button>
              {action==="create" && (
                <button onClick={downloadExcel}
                  className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm hover:bg-gray-50">
                  ⬇ Excel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Script */}
        {showScript && script && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">📋 腳本已生成</p>
              <span className="text-xs text-gray-400">點文字框 → Ctrl+A → Ctrl+C</span>
            </div>
            <div className="bg-blue-50 rounded p-3 text-xs text-blue-800 space-y-0.5">
              <p>1️⃣ 點一下黑色文字框（自動全選）</p>
              <p>2️⃣ <kbd className="bg-blue-100 px-1 rounded font-mono">Ctrl+C</kbd> 複製</p>
              <p>3️⃣ FortiGate 頁面 → <kbd className="bg-blue-100 px-1 rounded font-mono">F12</kbd> → Console → 貼上 → Enter</p>
            </div>
            <textarea
              readOnly value={script}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              rows={14}
              className="w-full font-mono text-xs bg-gray-900 text-green-400 rounded p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-text"
            />
          </div>
        )}

      </div>
    </div>
  );
}
