import React, { useEffect, useState } from "react";
import { CalendarDays, Users, ShoppingBag, Plus, MapPin, Clock, Check, X } from "lucide-react";
import { supabase } from "./supabaseClient";

const fmt = d => new Date(d).toLocaleString([], { dateStyle:"medium", timeStyle:"short" });

export default function CampusHub({section,session,onLogin,notify}) {
  const [events,setEvents]=useState([]);
  const [clubs,setClubs]=useState([]);
  const [listings,setListings]=useState([]);
  const [busy,setBusy]=useState(true);
  const [modal,setModal]=useState(null);

  const load=async()=>{
    setBusy(true);
    const [e,c,l]=await Promise.all([
      supabase.from("events").select("*,profiles:creator_id(display_name,username)").order("starts_at",{ascending:true}).limit(30),
      supabase.from("clubs").select("*").order("created_at",{ascending:false}).limit(30),
      supabase.from("marketplace_listings").select("*,profiles:seller_id(display_name,username)").eq("status","active").order("created_at",{ascending:false}).limit(30)
    ]);
    setEvents(e.data||[]);setClubs(c.data||[]);setListings(l.data||[]);setBusy(false);
  };
  useEffect(()=>{load();},[section]);

  const joinEvent=async(id)=>{
    if(!session){onLogin();return;}
    const {error}=await supabase.from("event_attendees").insert({event_id:id,user_id:session.user.id});
    if(error && error.code!=="23505") notify(error.message); else notify("You're attending this event");
  };
  const joinClub=async(id)=>{
    if(!session){onLogin();return;}
    const {error}=await supabase.from("club_members").insert({club_id:id,user_id:session.user.id});
    if(error && error.code!=="23505") notify(error.message); else notify("Joined club");
  };

  if(section==="Events") return <HubPage icon={<CalendarDays/>} eyebrow="CAMPUS EVENTS" title="What's happening?" subtitle="Discover talks, fests, hackathons, meetups and student activities." action={()=>session?setModal("event"):onLogin()} actionText="Create event">
    {busy?<HubEmpty text="Loading events…"/>:events.length?events.map(e=><div className="hub-card" key={e.id}><div className="hub-card-icon">📅</div><div className="hub-card-main"><span className="hub-kicker">{fmt(e.starts_at)}</span><h3>{e.title}</h3><p>{e.description||"Campus event"}</p><small><MapPin size={13}/>{e.location||"Campus"} {e.ends_at&&<><Clock size={13}/>{fmt(e.ends_at)}</>}</small></div><button className="join-btn" onClick={()=>joinEvent(e.id)}>Attend</button></div>):<HubEmpty text="No events yet. Create the first one."/>}
    {modal==="event"&&<EventForm session={session} close={()=>setModal(null)} done={()=>{setModal(null);load();notify("Event created")}}/>}
  </HubPage>;

  if(section==="Clubs") return <HubPage icon={<Users/>} eyebrow="STUDENT CLUBS" title="Find your community." subtitle="Clubs can publish their identity, activities and membership." action={()=>session?setModal("club"):onLogin()} actionText="Create club">
    {busy?<HubEmpty text="Loading clubs…"/>:clubs.length?clubs.map(c=><div className="hub-card" key={c.id}><div className="hub-card-icon">{c.logo_url?<img src={c.logo_url} alt=""/>:"🎓"}</div><div className="hub-card-main"><span className="hub-kicker">{c.category||"Student club"}</span><h3>{c.name}</h3><p>{c.description||"A student-led campus club."}</p></div><button className="join-btn" onClick={()=>joinClub(c.id)}>Join</button></div>):<HubEmpty text="No clubs yet. Create the first one."/>}
    {modal==="club"&&<ClubForm session={session} close={()=>setModal(null)} done={()=>{setModal(null);load();notify("Club created")}}/>}
  </HubPage>;

  return <HubPage icon={<ShoppingBag/>} eyebrow="CAMPUS MARKETPLACE" title="Buy, sell, reuse." subtitle="A student-to-student marketplace for campus life." action={()=>session?setModal("listing"):onLogin()} actionText="List an item">
    {busy?<HubEmpty text="Loading marketplace…"/>:listings.length?listings.map(l=><div className="hub-card" key={l.id}><div className="hub-card-icon">{l.image_url?<img src={l.image_url} alt=""/>:"🛍️"}</div><div className="hub-card-main"><span className="hub-kicker">{l.category||"Campus item"} · {l.condition||"Condition not specified"}</span><h3>{l.title}</h3><p>{l.description||"No description."}</p><small><MapPin size={13}/>{l.location||"Campus"} · <strong>{l.price!=null?"₹"+Number(l.price).toLocaleString("en-IN"):"Price on request"}</strong></small></div><button className="join-btn" onClick={()=>notify("Seller contact can be added in the next marketplace pass")}>View</button></div>):<HubEmpty text="No listings yet. List something useful."/>}
    {modal==="listing"&&<ListingForm session={session} close={()=>setModal(null)} done={()=>{setModal(null);load();notify("Listing published")}}/>}
  </HubPage>;
}

function HubPage({icon,eyebrow,title,subtitle,action,actionText,children}){return <div className="hub-page"><div className="hub-head"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div><button className="primary-btn" onClick={action}><Plus size={17}/>{actionText}</button></div><div className="hub-icon-title">{icon}<span>Live campus directory</span></div><div className="hub-list">{children}</div></div>}
function HubEmpty({text}){return <div className="empty"><div>🛰️</div><h3>{text}</h3></div>}
function Form({title,fields,submit,close}){const [v,setV]=useState({});const set=(k,x)=>setV(a=>({...a,[k]:x}));return <div className="modal-backdrop" onMouseDown={close}><div className="info-modal hub-form" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={close}><X size={18}/></button><h2>{title}</h2>{fields.map(f=><label key={f.k}>{f.l}<input value={v[f.k]||""} onChange={e=>set(f.k,e.target.value)} placeholder={f.p||""}/></label>)}<button className="primary-btn wide" onClick={()=>submit(v)}>Publish</button></div></div>}
function EventForm({session,close,done}){return <Form title="Create an event" close={close} fields={[{k:"title",l:"Title",p:"Hackathon, workshop..."},{k:"description",l:"Description"},{k:"location",l:"Location",p:"Block / auditorium"},{k:"starts_at",l:"Start time",p:"2026-10-12T10:00"}]} submit={async v=>{if(!v.title||!v.starts_at)return;const {error}=await supabase.from("events").insert({creator_id:session.user.id,title:v.title,description:v.description,location:v.location,starts_at:new Date(v.starts_at).toISOString()});if(error)throw error;done()}}/>}
function ClubForm({session,close,done}){return <Form title="Create a club" close={close} fields={[{k:"name",l:"Club name"},{k:"category",l:"Category",p:"Coding, Robotics..."},{k:"description",l:"Description"}]} submit={async v=>{if(!v.name)return;const {error}=await supabase.from("clubs").insert({owner_id:session.user.id,name:v.name,category:v.category,description:v.description});if(error)throw error;done()}}/>}
function ListingForm({session,close,done}){return <Form title="List an item" close={close} fields={[{k:"title",l:"Item"},{k:"price",l:"Price",p:"700"},{k:"category",l:"Category",p:"Books, electronics..."},{k:"condition",l:"Condition",p:"Good"},{k:"location",l:"Location",p:"Campus"}]} submit={async v=>{if(!v.title)return;const {error}=await supabase.from("marketplace_listings").insert({seller_id:session.user.id,title:v.title,price:v.price?Number(v.price):null,category:v.category,condition:v.condition,location:v.location});if(error)throw error;done()}}/>}
