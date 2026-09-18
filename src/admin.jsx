import React,{useEffect,useState} from "react";
import {Activity,AlertTriangle,ArrowLeft,BarChart3,CheckCircle2,Clock3,FileText,Flag,LayoutDashboard,RefreshCw,Search,Shield,Trash2,Users} from "lucide-react";
import {supabase} from "./supabaseClient";

const fmt=d=>d?new Date(d).toLocaleString():"Unknown";
const short=id=>id&&id.length>14?id.slice(0,8)+"…"+id.slice(-4):id||"system";
const title=s=>({overview:"Command center",users:"Users",content:"Content",reports:"Reports",activity:"Live activity",security:"Security & audit"}[s]||"Control center");

export default function AdminPortal({session,onExit,notify}){
 const [section,setSection]=useState("overview"),[loading,setLoading]=useState(true),[role,setRole]=useState(null),[query,setQuery]=useState("");
 const [data,setData]=useState({users:[],posts:[],reports:[],logs:[],communities:[],restrictions:[]});
 const load=async()=>{
  if(!session?.user?.id)return;
  setLoading(true);
  try{
   const rr=await supabase.from("admin_roles").select("role").eq("user_id",session.user.id).maybeSingle();
   if(rr.error)throw rr.error;if(!rr.data){setRole(null);return} setRole(rr.data.role);
   const qs=await Promise.all([
    supabase.from("profiles").select("id,username,display_name,course,year,campus,created_at,updated_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("posts").select("id,title,body,author_id,community_id,created_at,updated_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("reports").select("id,reporter_id,post_id,comment_id,reason,details,status,created_at").order("created_at",{ascending:false}).limit(100),
    supabase.from("audit_logs").select("id,actor_id,action,entity_type,entity_id,created_at").order("created_at",{ascending:false}).limit(150),
    supabase.from("communities").select("id,name,label,description,icon,color,created_at").order("created_at",{ascending:false}),
    supabase.from("user_restrictions").select("id,user_id,kind,reason,expires_at,active,created_at").eq("active",true).order("created_at",{ascending:false})
   ]);
   const err=qs.find(x=>x.error)?.error;if(err)throw err;
   setData({users:qs[0].data||[],posts:qs[1].data||[],reports:qs[2].data||[],logs:qs[3].data||[],communities:qs[4].data||[],restrictions:qs[5].data||[]});
  }catch(e){notify?.(e.message||"Admin data could not be loaded")}finally{setLoading(false)}
 };
 useEffect(()=>{load()},[session?.user?.id]);
 useEffect(()=>{if(!role)return;const c=supabase.channel("campusverse-admin-live").on("postgres_changes",{event:"*",schema:"public",table:"audit_logs"},load).on("postgres_changes",{event:"*",schema:"public",table:"reports"},load).on("postgres_changes",{event:"*",schema:"public",table:"posts"},load).on("postgres_changes",{event:"*",schema:"public",table:"comments"},load).on("postgres_changes",{event:"*",schema:"public",table:"user_restrictions"},load).subscribe();return()=>supabase.removeChannel(c)},[role,session?.user?.id]);
 const del=async id=>{if(!window.confirm("Delete this post permanently?"))return;const r=await supabase.from("posts").delete().eq("id",id);if(r.error)notify?.(r.error.message);else{notify?.("Post deleted");load()}};
 const restrict=async(userId,kind)=>{ const reason=window.prompt("Reason for this restriction:"); if(reason===null)return; const r=await supabase.from("user_restrictions").insert({user_id:userId,kind,reason:reason||"Admin action",expires_at:kind==="suspended"?new Date(Date.now()+24*60*60*1000).toISOString():null,created_by:session.user.id}); if(r.error)notify?.(r.error.message);else{notify?.(kind==="banned"?"User banned":"User suspended for 24 hours");load()} };
 const unrestrict=async(id)=>{const r=await supabase.from("user_restrictions").update({active:false}).eq("id",id);if(r.error)notify?.(r.error.message);else{notify?.("Restriction lifted");load()}};
 const report=async(id,status)=>{const r=await supabase.from("reports").update({status}).eq("id",id);if(r.error)notify?.(r.error.message);else{notify?.("Report updated");load()}};
 if(!session)return <Gate title="Admin sign-in required" detail="Log in with the account assigned as an administrator." onExit={onExit}/>;
 if(loading&&!role)return <Gate title="Checking control access…" detail="Verifying your administrator role." onExit={onExit}/>;
 if(!role)return <Gate title="Access denied" detail="This account is not assigned to the control plane." onExit={onExit}/>;
 const open=data.reports.filter(r=>r.status==="open"||r.status==="reviewing").length;
 const users=data.users.filter(u=>(u.display_name||"").toLowerCase().includes(query.toLowerCase())||(u.username||"").toLowerCase().includes(query.toLowerCase()));
 const posts=data.posts.filter(p=>(p.title||"").toLowerCase().includes(query.toLowerCase())||(p.body||"").toLowerCase().includes(query.toLowerCase()));
 return <div className="admin-shell">
  <aside className="admin-sidebar"><div className="admin-brand"><div className="admin-mark">C</div><div><strong>CampusVerse</strong><small>Control Center</small></div></div><div className="admin-status"><i className="live-dot"/> {role} access</div>
   <nav><Nav icon={<LayoutDashboard/>} text="Command center" active={section==="overview"} go={()=>setSection("overview")}/><Nav icon={<Users/>} text="Users" active={section==="users"} go={()=>setSection("users")}/><Nav icon={<FileText/>} text="Content" active={section==="content"} go={()=>setSection("content")}/><Nav icon={<Flag/>} text="Reports" badge={open} active={section==="reports"} go={()=>setSection("reports")}/><Nav icon={<Activity/>} text="Live activity" active={section==="activity"} go={()=>setSection("activity")}/><Nav icon={<Shield/>} text="Security log" active={section==="security"} go={()=>setSection("security")}/></nav>
   <button className="admin-exit" onClick={onExit}><ArrowLeft size={16}/> Back to CampusVerse</button>
  </aside>
  <main className="admin-main"><header className="admin-topbar"><div><span className="admin-kicker">CONTROL PLANE</span><h1>{title(section)}</h1><p>Monitor and manage live CampusVerse activity.</p></div><div className="admin-tools"><div className="admin-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search users or posts"/></div><button className="admin-icon-btn" onClick={load}><RefreshCw size={17}/></button></div></header>
   {section==="overview"&&<Overview data={data} open={open} go={setSection}/>}
   {section==="users"&&<Panel title="User directory" icon={<Users/>}><Table rows={users} cols={[["User",u=><div className="admin-user"><span className="admin-avatar">{(u.display_name||u.username||"CM").slice(0,2).toUpperCase()}</span><div><strong>{u.display_name||"Unnamed member"}</strong><small>@{u.username||"no-username"} · {short(u.id)}</small></div></div>],["Study",u=><span>{u.course||"Not set"}{u.year?" · "+u.year:""}</span>],["Campus",u=><span>{u.campus||"Not set"}</span>],["Joined",u=><span>{fmt(u.created_at)}</span>],["Control",u=>{const rr=data.restrictions.find(x=>x.user_id===u.id);return rr?<button className="admin-row-action" onClick={()=>unrestrict(rr.id)}>Lift {rr.kind}</button>:<div className="admin-row-actions"><button onClick={()=>restrict(u.id,"suspended")}>Suspend 24h</button><button onClick={()=>restrict(u.id,"banned")}>Ban</button></div>}]]}/></Panel>}
   {section==="content"&&<Panel title="Content control" icon={<FileText/>}><Table rows={posts} cols={[["Post",p=><div><strong>{p.title}</strong><small>{p.body||"No body"}</small></div>],["Author",p=><span>{short(p.author_id)}</span>],["Created",p=><span>{fmt(p.created_at)}</span>],["Action",p=><button className="admin-danger-btn" onClick={()=>del(p.id)}><Trash2 size={14}/> Delete</button>]]}/></Panel>}
   {section==="reports"&&<Panel title="Moderation queue" icon={<Flag/>}><Table rows={data.reports} cols={[["Status",r=><span className={"status status-"+r.status}>{r.status}</span>],["Reason",r=><div><strong>{r.reason}</strong><small>{r.details||"No additional details"}</small></div>],["Target",r=><span>{r.post_id?"Post "+short(r.post_id):r.comment_id?"Comment "+short(r.comment_id):"Unknown"}</span>],["Reported",r=><span>{fmt(r.created_at)}</span>],["Action",r=><div className="admin-row-actions"><button onClick={()=>report(r.id,"reviewing")} disabled={r.status!=="open"}>Review</button><button onClick={()=>report(r.id,"resolved")} disabled={r.status==="resolved"}>Resolve</button><button onClick={()=>report(r.id,"dismissed")} disabled={r.status==="dismissed"}>Dismiss</button></div>]]}/></Panel>}
   {section==="activity"&&<Panel title="Live activity stream" icon={<Activity/>}><ActivityList logs={data.logs}/></Panel>}
   {section==="security"&&<Panel title="Security & audit trail" icon={<Shield/>}><ActivityList logs={data.logs}/></Panel>}
  </main></div>
}
function Gate({title,detail,onExit}){return <div className="admin-gate"><div className="admin-gate-card"><div className="admin-mark">C</div><Shield size={22}/><h1>{title}</h1><p>{detail}</p><button className="primary-btn" onClick={onExit}>Return to CampusVerse</button></div></div>}
function Nav({icon,text,active,badge,go}){return <button className={active?"active":""} onClick={go}>{icon}<span>{text}</span>{badge>0&&<b>{badge}</b>}</button>}
function Panel({title,icon,children}){return <section className="admin-panel"><div className="admin-panel-head">{icon}<div><h2>{title}</h2><p>Live data from Supabase</p></div></div>{children}</section>}
function Table({rows,cols}){return rows.length?<div className="admin-table"><div className="admin-table-head">{cols.map(c=><span key={c[0]}>{c[0]}</span>)}</div>{rows.map(r=><div className="admin-table-row" key={r.id}>{cols.map(c=><div key={c[0]}>{c[1](r)}</div>)}</div>)}</div>:<div className="admin-empty"><Clock3 size={20}/><p>No matching records.</p></div>}
function ActivityList({logs}){return <div className="activity-list">{logs.length?logs.map(l=><div className="activity-item" key={l.id}><div className="activity-icon">{l.action==="delete"?<AlertTriangle size={15}/>:l.action==="insert"?<CheckCircle2 size={15}/>:<Activity size={15}/>}</div><div><strong>{l.action.toUpperCase()} · {l.entity_type}</strong><small>Actor {short(l.actor_id)} · {fmt(l.created_at)}</small><p>{l.entity_id?"Entity "+short(l.entity_id):"System event"}</p></div></div>):<div className="admin-empty"><Clock3 size={20}/><p>No activity recorded yet.</p></div>}</div>}
function Overview({data,open,go}){const stats=[["Members",data.users.length,Users,"users"],["Posts",data.posts.length,FileText,"content"],["Open reports",open,AlertTriangle,"reports"],["Audit events",data.logs.length,Activity,"activity"]];return <><div className="admin-stat-grid">{stats.map(s=><button className="admin-stat" key={s[0]} onClick={()=>go(s[3])}><span><s[2] size={18}/></span><div><strong>{s[1]}</strong><small>{s[0]}</small></div></button>)}</div><div className="admin-overview-grid"><Panel title="System health" icon={<BarChart3/>}><div className="health-grid"><Health label="Database" value="Connected"/><Health label="Realtime" value="Active"/><Health label="Admin role" value="Verified"/><Health label="Audit trail" value="Recording"/></div></Panel><Panel title="Recent activity" icon={<Activity/>}><ActivityList logs={data.logs.slice(0,8)}/></Panel></div><Panel title="Communities under management" icon={<Users/>}><div className="admin-community-grid">{data.communities.map(c=><div key={c.id}><span>{c.icon}</span><strong>r/{c.name}</strong><small>{c.label}</small></div>)}</div></Panel></>}
function Health({label,value}){return <div className="health"><i className="live-dot"/><div><strong>{label}</strong><small>{value}</small></div></div>}
