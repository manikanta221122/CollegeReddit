import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown, ArrowUp, Bell, Bookmark, ChevronDown, Compass, Flame, CalendarDays, ShoppingBag,
  Home, Image, Info, Menu, MessageCircle, MoreHorizontal, Plus,
  Search, Send, Settings, ShieldCheck, Sparkles, Trophy, Users, X,
  LogOut, UserRound, CircleHelp, Flag, Check, Lock, SlidersHorizontal
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { loadCampusData, toggleCommunityMembership, createCampusPost, togglePostSave, voteOnPost, addCampusComment, reportCampusPost } from "./campusApi";
import AdminPortal from "./admin.jsx";
import CampusHub from "./CampusHub.jsx";
import "./styles.css";

function initialsFromName(value) {
  const clean = String(value || "").trim().replace(/\s+/g, " ");
  if (!clean) return "CM";
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function App() {
  const [posts, setPosts] = useState([]);
  const [communitiesData, setCommunitiesData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [session, setSession] = useState(null);
  const [active, setActive] = useState("Home");
  const [adminMode, setAdminMode] = useState(() => window.location.pathname.replace(/\/+$/, "") === "/admin");
  const [sort, setSort] = useState("Hot");
  const [query, setQuery] = useState("");
  const [joined, setJoined] = useState(["campus", "academics"]);
  const [showComposer, setShowComposer] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsRead, setNotificationsRead] = useState(true);
  const [profile, setProfile] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [infoModal, setInfoModal] = useState(null);
  const [commentPost, setCommentPost] = useState(null);
  const [postMenu, setPostMenu] = useState(null);
  const [onboarding, setOnboarding] = useState(() => localStorage.getItem("campusverse_onboarding_done") !== "1");
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [suggested, setSuggested] = useState([]);
  const [following, setFollowing] = useState(new Set());
  useEffect(() => { if (!suggested.length && communitiesData.length) setSuggested(communitiesData.slice(0,3).map(c=>c.name)); }, [communitiesData]);
  const searchRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const mountedData = useRef(true);
  const refreshData = async (userId = session?.user?.id) => {
    setLoadingData(true);
    try {
      const data = await loadCampusData(userId);
      if (!mountedData.current) return;
      setCommunitiesData(data.communities);
      setPosts(data.posts);

      if (userId) {
        const [{ data: memberships }, { data: profileRow }, { data: noteRows }, { data: followRows }] = await Promise.all([
          supabase.from("community_members").select("community_id").eq("user_id", userId),
          supabase.from("profile_activity_counts").select("id,post_count,comment_count,karma").eq("id", userId).maybeSingle(),
          supabase.from("notifications").select("id,type,message,read_at,created_at,actor_id,post_id").eq("user_id", userId).order("created_at", { ascending:false }).limit(20),
          supabase.from("follows").select("following_id").eq("follower_id", userId)
        ]);
        const names = (memberships || []).map(x => data.communities.find(c => c.id === x.community_id)?.name).filter(Boolean);
        setJoined(Array.from(new Set(names)));
        const { data: profileBase } = await supabase.from("profiles").select("id,username,display_name,bio,avatar_url,course,year,campus,created_at").eq("id", userId).maybeSingle();
        setProfile(profileBase ? {...profileBase, postCount: profileRow?.post_count || 0, commentCount: profileRow?.comment_count || 0, karma: profileRow?.karma || 0} : null);
        setNotifications(noteRows || []);
        setFollowing(new Set((followRows || []).map(x => x.following_id)));
        setNotificationsRead((noteRows || []).every(n => !!n.read_at));
      } else {
        setJoined([]);
        setProfile(null);
        setNotifications([]);
        setFollowing(new Set());
        setNotificationsRead(true);
      }
    } catch (e) {
      if (mountedData.current) notify(e.message || "Could not load campus data");
    } finally {
      if (mountedData.current) setLoadingData(false);
    }
  };
  useEffect(() => () => { mountedData.current = false; }, []);
  useEffect(() => { refreshData(session?.user?.id); }, [session?.user?.id]);
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase.channel("campusverse-live")
      .on("postgres_changes", { event:"*", schema:"public", table:"posts" }, () => refreshData(session.user.id))
      .on("postgres_changes", { event:"*", schema:"public", table:"comments" }, () => refreshData(session.user.id))
      .on("postgres_changes", { event:"*", schema:"public", table:"post_votes" }, () => refreshData(session.user.id))
      .on("postgres_changes", { event:"*", schema:"public", table:"community_members" }, () => refreshData(session.user.id))
      .on("postgres_changes", { event:"*", schema:"public", table:"notifications", filter:`user_id=eq.${session.user.id}` }, () => refreshData(session.user.id))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        setShowNotifications(false);
        setShowProfile(false);
        setPostMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    const onToast = (e) => notify(e.detail);
    window.addEventListener("campusverse:toast", onToast);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("campusverse:toast", onToast); };
  }, []);

  const finishOnboarding = async (choice = suggested) => {
    localStorage.setItem("campusverse_onboarding_done", "1");
    setOnboarding(false);
    if (session?.user?.id) {
      for (const name of choice) {
        const c=communitiesData.find(x=>x.name===name);
        if (c) await toggleCommunityMembership(c.id,session.user.id,false).catch(()=>{});
      }
      await refreshData(session.user.id);
    } else {
      setJoined(choice);
    }
    notify(choice.length ? `${choice.length} communities selected` : "You're all set");
  };

  const notify = (message) => {
    setToast(message);
    window.clearTimeout(window.__campusToast);
    window.__campusToast = window.setTimeout(() => setToast(""), 1900);
  };

  const go = (destination) => {
    if (destination === "__ADMIN__") { window.history.pushState({}, "", "/admin"); setAdminMode(true); setShowProfile(false); return; }
    setActive(destination);
    setQuery("");
    setMenuOpen(false);
    setShowProfile(false);
  };

  const vote = async (id, direction) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    if (!session) { setShowLogin(true); return; }
    try { await voteOnPost(id, session.user.id, post.myVote || 0, direction); await refreshData(session.user.id); }
    catch (e) { notify(e.message || "Vote failed"); }
  };

  const toggleSave = async (id) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    if (!session) { setShowLogin(true); return; }
    try { await togglePostSave(id, session.user.id, post.saved); await refreshData(session.user.id); notify(post.saved ? "Removed from saved" : "Saved"); }
    catch (e) { notify(e.message || "Save failed"); }
  };

  const toggleFollow = async (personId) => {
    if (!session) { setShowLogin(true); return; }
    if (!personId || personId === session.user.id) return;
    const isFollowing = following.has(personId);
    try {
      if (isFollowing) await supabase.from("follows").delete().eq("follower_id",session.user.id).eq("following_id",personId);
      else await supabase.from("follows").insert({follower_id:session.user.id,following_id:personId});
      setFollowing(prev => { const n=new Set(prev); isFollowing ? n.delete(personId) : n.add(personId); return n; });
      notify(isFollowing ? "Unfollowed" : "Following");
    } catch(e) { notify(e.message || "Could not update follow"); }
  };

  const toggleJoin = async (name) => {
    if (!session) { setShowLogin(true); return; }
    const c = communitiesData.find(x => x.name === name);
    if (!c) return;
    const isJoined = joined.includes(name);
    try { await toggleCommunityMembership(c.id, session.user.id, isJoined); await refreshData(session.user.id); notify(isJoined ? "Left r/" + name : "Joined r/" + name); }
    catch (e) { notify(e.message || "Could not update membership"); }
  };

  const visiblePosts = useMemo(() => {
    let result = [...posts];
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(p => `${p.title} ${p.body} ${p.community} ${p.author} ${p.tags.join(" ")}`.toLowerCase().includes(q));
    }
    if (active === "Saved") result = result.filter(p => p.saved);
    if (active === "My Feed") result = result.filter(p => joined.includes(p.community));
    if (communitiesData.some(c => c.name === active)) result = result.filter(p => p.community === active);
    if (sort === "New") result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sort === "Top") result.sort((a, b) => b.votes - a.votes);
    if (sort === "Hot") result.sort((a, b) => Number(b.hot) - Number(a.hot) || b.votes - a.votes);
    return result;
  }, [posts, query, active, sort, joined]);

  const createPost = async (data) => {
    if (!session) { setShowLogin(true); return; }
    try {
      let imageUrl = null;
      if (data.file) {
        const file = data.file;
        if (!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) throw new Error("Use JPG, PNG, WEBP or GIF.");
        if (file.size > 10*1024*1024) throw new Error("Post image must be 10 MB or smaller.");
        const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
        const path=session.user.id+"/post-"+Date.now()+"."+ext;
        const {error:uploadError}=await supabase.storage.from("post-media").upload(path,file,{upsert:false,contentType:file.type,cacheControl:"3600"});
        if(uploadError) throw uploadError;
        imageUrl=supabase.storage.from("post-media").getPublicUrl(path).data.publicUrl;
      }
      await createCampusPost({ ...data, tags: ["New Post"], userId: session.user.id, imageUrl });
      setShowComposer(false); setActive("Home"); await refreshData(session.user.id); notify("Post published");
    } catch (e) { notify(e.message || "Could not publish post"); }
  };

  const sharePost = async (post) => {
    const url = window.location.href;
    try { await navigator.clipboard?.writeText(`${post.title} • ${url}`); notify("Post link copied"); }
    catch { notify("Share link ready"); }
  };

  return adminMode ? <AdminPortal session={session} onExit={() => { window.history.pushState({}, "", "/"); setAdminMode(false); }} notify={notify} /> : (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => go("Home")} aria-label="Go home">
          <div className="brand-mark">C</div>
          <div><div className="brand-name">Campus<span>Reddit</span></div><div className="brand-sub">the live university network</div></div>
        </button>
        <div className="searchbox">
          <Search size={18}/><input ref={searchRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search campus, communities, posts..."/><kbd>⌘ K</kbd>
        </div>
        <div className="top-actions">
          <button className="icon-btn mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={21}/></button>
          <button className="icon-btn" onClick={() => { setShowNotifications(!showNotifications); setShowProfile(false); }} aria-label="Notifications"><Bell size={20}/>{!notificationsRead && <span className="notification-dot"/>}</button>
          <button className={`profile-pill ${showProfile ? "active" : ""}`} onClick={() => { setShowProfile(!showProfile); setShowNotifications(false); }} aria-expanded={showProfile}><span className="avatar me">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initialsFromName(profile?.display_name || session?.user?.user_metadata?.full_name || session?.user?.email?.split("@")[0] || "CM")}</span><ChevronDown size={15}/></button>
        </div>
        {showNotifications && <NotificationPanel notifications={notifications} read={notificationsRead} onRead={async () => { if (session) { await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",session.user.id); setNotificationsRead(true); setNotifications(n => n.map(x => ({...x,read:true}))); notify("Notifications marked as read"); } }}/>}
        {showProfile && <ProfileMenu session={session} profile={profile} onNavigate={go} onInfo={setInfoModal} onLogin={() => setShowLogin(true)} onLogout={async () => { await supabase.auth.signOut(); localStorage.removeItem("campusverse_onboarding_done"); setShowProfile(false); notify("Logged out"); }}/>} 
      </header>

      <div className="layout">
        <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
          <div className="mobile-close"><button onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
          <nav className="nav-group">
            <NavItem icon={<Home/>} label="Home" active={active === "Home"} onClick={() => go("Home")}/>
            <NavItem icon={<Sparkles/>} label="My Feed" active={active === "My Feed"} onClick={() => go("My Feed")}/>
            <NavItem icon={<Compass/>} label="Explore" active={active === "Explore"} onClick={() => go("Explore")}/>
            <NavItem icon={<Bookmark/>} label="Saved" active={active === "Saved"} onClick={() => go("Saved")}/>
            <NavItem icon={<CalendarDays/>} label="Events" active={active === "Events"} onClick={() => go("Events")}/>
            <NavItem icon={<Users/>} label="Clubs" active={active === "Clubs"} onClick={() => go("Clubs")}/>
            <NavItem icon={<ShoppingBag/>} label="Marketplace" active={active === "Marketplace"} onClick={() => go("Marketplace")}/>
          </nav>
          <div className="sidebar-title">COMMUNITIES <button onClick={() => go("Explore")} aria-label="Explore communities"><Plus size={15}/></button></div>
          <div className="community-list">
            {communitiesData.slice(0, 6).map(c => <button className={`community-nav ${active === c.name ? "active" : ""}`} key={c.name} onClick={() => go(c.name)}><span className="community-icon" style={{background: c.color + "18"}}>{c.icon}</span><span>r/{c.name}</span></button>)}
          </div>
          <div className="sidebar-card"><div className="mini-icon"><ShieldCheck size={18}/></div><div><strong>Campus verified</strong><p>Built for students. Reported content is reviewed by moderators.</p></div></div>
          <div className="sidebar-bottom"><button onClick={() => setInfoModal("about")}>About</button><button onClick={() => setInfoModal("rules")}>Rules</button><button onClick={() => setInfoModal("privacy")}>Privacy</button><button onClick={() => setInfoModal("help")}>Help</button></div>
        </aside>

        <main className="main">
          {["Events","Clubs","Marketplace"].includes(active) ? <CampusHub section={active} session={session} onLogin={() => setShowLogin(true)} notify={notify}/>\n          : active === "Explore" ? <Explore communities={communitiesData} joined={joined} toggleJoin={toggleJoin} onCreate={() => setShowComposer(true)} />
          : active === "Profile" ? <ProfilePage profile={profile} communities={communitiesData} joined={joined} onExplore={() => go("Explore")} onCreate={() => setShowComposer(true)} session={session} onSaved={async () => { await refreshData(session?.user?.id); }}/>
          : active !== "Home" && active !== "My Feed" && active !== "Saved" && communitiesData.some(c => c.name === active)
          ? <CommunityPage communities={communitiesData} name={active} joined={joined} toggleJoin={toggleJoin} onCreate={() => setShowComposer(true)} posts={visiblePosts} vote={vote} toggleSave={toggleSave} onComment={setCommentPost} onShare={sharePost} onMore={setPostMenu}/>
          : <>
              {active === "Home" && <HomeHero session={session} onLogin={() => setShowLogin(true)} onCreate={() => setShowComposer(true)} onExplore={() => go("Explore")} />}
              {active === "Home" && <QuickCommunities communities={communitiesData} joined={joined} toggleJoin={toggleJoin} onExplore={() => go("Explore")} />}
              <div className="feed-toolbar">
                <div className="feed-title"><h2>{active === "My Feed" ? "Your feed" : active === "Saved" ? "Saved posts" : "Today's campus"}</h2><span>{visiblePosts.length} conversations</span></div>
                <div className="sort-tabs">{["Hot", "New", "Top"].map(s => <button key={s} className={sort === s ? "selected" : ""} onClick={() => setSort(s)}>{s === "Hot" && <Flame size={15}/>} {s}</button>)}</div>
              </div>
              <div className="feed">{loadingData ? <div className="empty"><div>⏳</div><h3>Loading campus conversations…</h3><p>Connecting to the campus database.</p></div> : visiblePosts.length ? <FeedWithSuggestions posts={visiblePosts} vote={vote} toggleSave={toggleSave} onComment={setCommentPost} onShare={sharePost} onMore={setPostMenu} joined={joined} communities={communitiesData} onJoin={toggleJoin} following={following} onFollow={toggleFollow} session={session} /> : <EmptyState title={active === "Saved" ? "Nothing saved yet" : active === "My Feed" ? "Your feed is quiet" : "No posts found"} onCreate={() => setShowComposer(true)} />}</div>
            </>}
        </main>

        <aside className="rightbar">
          <div className="right-card trending"><div className="card-heading"><h3><Flame size={17}/> Trending now</h3><button onClick={() => go("Explore")}>Explore</button></div>{posts.slice(0,5).map((p,i) => <div className="trend" key={p.id} onClick={() => setQuery(p.title)}><span>0{i+1}</span><div><strong>{p.title}</strong><small>{p.votes} votes · {p.comments} comments</small></div></div>)}{!posts.length && <div className="tiny">No live conversations yet.</div>}</div>
          <div className="right-card communities-card"><div className="card-heading"><h3><Users size={17}/> Communities</h3><button onClick={() => go("Explore")}>Explore</button></div>{communitiesData.slice(0,5).map(c => <CommunityRow key={c.name} c={c} joined={joined.includes(c.name)} toggle={() => toggleJoin(c.name)}/>)}</div>
          <div className="right-card campus-stats"><div className="stats-icon"><Users size={20}/></div><div><strong>Live campus</strong><p>{posts.length} conversations loaded from the database.</p><div className="pulse"><i/><i/><i/><i/><i/><i/><i/><i/></div></div></div>
          <div className="footer-note">CampusVerse is a live student community platform.<br/>Content shown here comes from the campus database.</div>
        </aside>
      </div>

      {showComposer && <Composer communities={communitiesData} onClose={() => setShowComposer(false)} onCreate={createPost}/>} 
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} onDone={() => {setShowLogin(false); finishOnboarding(); notify("Welcome to CampusVerse")}}/>}
      {commentPost && <CommentsModal post={commentPost} session={session} onClose={() => setCommentPost(null)} onRefresh={() => refreshData(session?.user?.id)} onLogin={() => setShowLogin(true)}/>} 
      {postMenu && <PostMenu post={postMenu} onClose={() => setPostMenu(null)} onShare={() => {sharePost(postMenu); setPostMenu(null)}} onSave={() => {toggleSave(postMenu.id); setPostMenu(null)}} onReport={async () => {
        if (!session) { setPostMenu(null); setShowLogin(true); return; }
        try { await reportCampusPost({postId:postMenu.id,userId:session.user.id,reason:"other"}); setPostMenu(null); notify("Thanks. The post was reported for review"); }
        catch (e) { notify(e.message || "Could not report post"); }
      }}/>} 
      {infoModal && <InfoModal type={infoModal} onClose={() => setInfoModal(null)}/>} 
      {onboarding && <WelcomeOverlay communities={communitiesData} step={onboardingStep} setStep={setOnboardingStep} suggested={suggested} setSuggested={setSuggested} onLogin={() => setShowLogin(true)} onFinish={finishOnboarding} onSkip={() => finishOnboarding([])} />}
      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}

function HomeHero({session,onLogin,onCreate,onExplore}) {
  return <section className="hero-card"><div className="hero-glow"/><div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> THE CAMPUS INTERNET</span><h1>Your campus.<br/><em>Your conversations.</em></h1><p>A community-first place for questions, stories, memes, opportunities and the conversations your official groups don't have.</p><div className="hero-actions"><button className="primary-btn" onClick={onCreate}><Plus size={18}/> Create post</button><button className="ghost-btn" onClick={onExplore}><Compass size={17}/> Explore communities</button></div></div><div className="hero-orbit"><div className="orbit-card oc1">🎮<span>Gaming</span></div><div className="orbit-card oc2">📚<span>Academics</span></div><div className="orbit-card oc3">😂<span>Memes</span></div><div className="orbit-center">C</div></div></section>;
}

function QuickCommunities({communities,joined,toggleJoin,onExplore}) {
  return <section className="quick-communities"><div className="section-heading"><div><span className="eyebrow">GET STARTED</span><h2>Find your people</h2></div><button onClick={onExplore}>View all <Compass size={14}/></button></div><div className="quick-grid">{communities.slice(0, 4).map(c => <div className="quick-card" key={c.name}><span className="community-icon" style={{background:c.color+"18"}}>{c.icon}</span><div><strong>r/{c.name}</strong><small>{c.memberCount ?? c.members ?? 0} members</small></div><button className={joined.includes(c.name) ? "joined-btn" : "join-btn"} onClick={() => toggleJoin(c.name)}>{joined.includes(c.name) ? "Joined" : "Join"}</button></div>)}</div></section>;
}

function WelcomeOverlay({communities,step,setStep,suggested,setSuggested,onLogin,onFinish,onSkip}) {
  const toggle = (name) => setSuggested(s => s.includes(name) ? s.filter(x => x !== name) : [...s, name]);
  return <div className="welcome-backdrop"><div className="welcome-shell">
    <button className="welcome-close" onClick={onSkip} aria-label="Skip onboarding"><X size={18}/></button>
    {step === 0 ? <div className="welcome-intro"><div className="welcome-logo">C</div><span className="eyebrow">WELCOME TO CAMPUSVERSE</span><h1>Your campus has a new front page.</h1><p>Ask questions, find communities, share what is happening and meet people who actually understand campus life.</p><div className="welcome-points"><span>🔥 Live campus conversations</span><span>👥 Communities for every interest</span><span>🛡️ Student-first community tools</span></div><div className="welcome-actions"><button className="primary-btn" onClick={() => setStep(1)}>Personalize my feed <Sparkles size={16}/></button><button className="welcome-login" onClick={onLogin}>I already have an account</button></div><button className="later-btn" onClick={onSkip}>Maybe later, let me explore</button></div>
    : <div className="welcome-select"><div className="welcome-top"><div><span className="eyebrow">STEP 2 OF 2</span><h2>Pick a few communities</h2><p>We'll use these to shape your first feed. You can change them anytime.</p></div><div className="step-count">{suggested.length} selected</div></div><div className="suggestion-grid">{communities.map(c => <button key={c.name} className={`suggestion-card ${suggested.includes(c.name) ? "selected" : ""}`} onClick={() => toggle(c.name)}><span className="community-icon" style={{background:c.color+"18"}}>{c.icon}</span><span><strong>r/{c.name}</strong><small>{c.label} · {c.members} members</small></span><span className="select-check">{suggested.includes(c.name) ? <Check size={14}/> : ""}</span></button>)}</div><div className="welcome-actions"><button className="primary-btn" onClick={() => onFinish(suggested)}>Enter CampusVerse <ArrowUp size={16}/></button><button className="welcome-login" onClick={() => setStep(0)}>Back</button></div><button className="later-btn" onClick={onSkip}>Skip suggestions and explore</button></div>}
    <div className="welcome-footer"><Lock size={12}/> No account is created until you choose to sign up.</div>
  </div></div>;
}

function NavItem({icon,label,active,onClick}) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>{React.cloneElement(icon,{size:19})}<span>{label}</span></button>; }

function NotificationPanel({notifications=[],read,onRead}) {
  return <div className="notification-panel"><div className="panel-head"><strong>Notifications</strong><button onClick={onRead}>{read ? "All read" : "Mark all read"}</button></div>
    {notifications.length ? notifications.map(n=><div className="notification" key={n.id}><span className="n-avatar">{n.type==="comment"?"💬":n.type==="vote"?"⬆️":"🔔"}</span><p><b>{n.title || "Campus activity"}</b>{n.body ? " "+n.body : ""}<small>{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</small></p></div>) : <div className="tiny">No notifications yet.</div>}
  </div>;
}

function ProfileMenu({session,profile,onNavigate,onInfo,onLogin,onLogout}) {
  const label=profile?.display_name || session?.user?.user_metadata?.full_name || session?.user?.email?.split("@")[0] || "Campus member";
  const initials=initialsFromName(label);
  return <div className="profile-menu">
    <div className="profile-summary"><span className="avatar me big">{profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials}</span><div><strong>{session ? "Your account" : "Your profile"}</strong><small>{session?.user?.email || "Sign in to join campus conversations"}</small></div></div>
    <button onClick={() => onNavigate("Profile")}><UserRound size={16}/> Profile</button>
    <button onClick={() => onNavigate("Saved")}><Bookmark size={16}/> Saved posts</button>
    <button onClick={() => onInfo("settings")}><Settings size={16}/> Settings</button>
    {session && <button onClick={() => onNavigate("__ADMIN__")}><ShieldCheck size={16}/> Control Center</button>}
    <div className="menu-divider"/>
    {session ? <button onClick={onLogout}><LogOut size={16}/> Log out</button> : <button onClick={onLogin}><LogOut size={16}/> Log in / create account</button>}
  </div>;
}

function FeedWithSuggestions({posts,vote,toggleSave,onComment,onShare,onMore,joined,communities,onJoin,following,onFollow,session}) {
  const [people,setPeople]=useState([]);
  useEffect(()=>{const ids=[...new Set(posts.map(p=>p.authorId).filter(Boolean))]; if(!ids.length){setPeople([]);return;} supabase.from("profiles").select("id,username,display_name,avatar_url").limit(30).then(({data})=>setPeople(data||[]));},[posts]);
  const suggestions=communities.filter(c=>!joined.includes(c.name)).slice(0,3);
  return <>{posts.map((post,i)=><React.Fragment key={post.id}><PostCard post={post} vote={vote} toggleSave={toggleSave} onComment={()=>onComment(post)} onShare={()=>onShare(post)} onMore={()=>onMore(post)}/>{(i===4 || (i===9 && suggestions.length)) && <SuggestionStrip communities={suggestions} people={people} following={following} onJoin={onJoin} onFollow={onFollow} session={session}/>}</React.Fragment>)}</>;
}
function SuggestionStrip({communities,people,following,onJoin,onFollow,session}) {
  const peopleToShow=people.filter(p=>p.id!==session?.user?.id && !following.has(p.id)).slice(0,3);
  return <section className="suggestion-strip"><div className="suggestion-strip-head"><div><span className="eyebrow">FOR YOU</span><h3>Suggested for you</h3><p>Communities and students you may want to follow.</p></div><Sparkles size={20}/></div><div className="suggestion-cards">{communities.map(c=><div className="suggestion-item" key={c.name}><span className="community-icon" style={{background:c.color+"18"}}>{c.icon}</span><div><strong>r/{c.name}</strong><small>{c.label}</small></div><button className="join-btn" onClick={()=>onJoin(c.name)}>Join</button></div>)}</div>{peopleToShow.length>0&&<><div className="suggestion-subhead">People you may know</div><div className="suggested-people">{peopleToShow.map(p=><div className="suggestion-item person-suggestion" key={p.id}><span className="avatar">{p.avatar_url?<img src={p.avatar_url} alt="" />:initialsFromName(p.display_name||p.username)}</span><div><strong>{p.display_name||"Campus student"}</strong><small>@{p.username||"student"}</small></div><button className="join-btn" onClick={()=>onFollow(p.id)}>Follow</button></div>)}</div></>}</section>;
}
function PostCard({post,vote,toggleSave,onComment,onShare,onMore}) {
  const community = { name: post.community, label: post.communityLabel, icon: post.communityIcon || "🏫", color: post.communityColor || "#f97316" };
  return <article className="post-card"><div className="vote-column"><button onClick={() => vote(post.id,"up")} aria-label="Upvote"><ArrowUp size={20}/></button><strong>{post.votes.toLocaleString()}</strong><button onClick={() => vote(post.id,"down")} aria-label="Downvote"><ArrowDown size={20}/></button></div><div className="post-main"><div className="post-meta"><span className="community-icon small" style={{background:community.color+"18"}}>{community.icon}</span><b>r/{post.community}</b><span>•</span><span>Posted by u/{post.author}</span><span>•</span><span>{post.time}</span>{post.hot && <span className="hot-pill"><Flame size={11}/> Hot</span>}</div><h3>{post.title}</h3><p className="post-body">{post.body}</p>{post.imageUrl && <img className="post-image" src={post.imageUrl} alt="" loading="lazy" />}<div className="tags">{post.tags.map(t => <span key={t}>#{t}</span>)}</div><div className="post-actions"><button onClick={onComment}><MessageCircle size={17}/> {post.comments} Comments</button><button onClick={() => toggleSave(post.id)} className={post.saved ? "saved" : ""}><Bookmark size={17} fill={post.saved ? "currentColor" : "none"}/> {post.saved ? "Saved" : "Save"}</button><button onClick={onShare}><Send size={16}/> Share</button><button className="more" onClick={onMore} aria-label="More options"><MoreHorizontal size={18}/></button></div></div></article>;
}

function CommunityRow({c,joined,toggle}) { return <div className="community-row"><span className="community-icon" style={{background:c.color+"18"}}>{c.icon}</span><div className="grow"><strong>r/{c.name}</strong><small>{c.members} members</small></div><button className={joined ? "joined-btn" : "join-btn"} onClick={toggle}>{joined ? "Joined" : "Join"}</button></div>; }

function CommunityPage({communities,name,joined,toggleJoin,onCreate,posts,vote,toggleSave,onComment,onShare,onMore}) { const c = communities.find(x => x.name === name) || communities[0]; return <><div className="community-banner" style={{"--accent":c.color}}><div className="community-large">{c.icon}</div><div className="community-title"><span>r/{c.name}</span><h1>{c.label}</h1><p>{c.members} members · Live conversations from this campus community.</p></div><button className={joined.includes(name) ? "joined-large" : "primary-btn"} onClick={() => toggleJoin(name)}>{joined.includes(name) ? "Joined" : "Join community"}</button></div><div className="feed-toolbar"><div className="feed-title"><h2>Community posts</h2><span>Fresh from r/{name}</span></div><button className="primary-btn compact" onClick={onCreate}><Plus size={16}/> Post</button></div><div className="feed">{posts.length ? posts.map(p => <PostCard key={p.id} post={p} vote={vote} toggleSave={toggleSave} onComment={() => onComment(p)} onShare={() => onShare(p)} onMore={() => onMore(p)}/>) : <EmptyState onCreate={onCreate}/>}</div></>; }

function ProfilePage({profile,communities,joined,onExplore,onCreate,session,onSaved}) {
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(profile?.display_name || "");
  const [username,setUsername]=useState(profile?.username || "");
  const [bio,setBio]=useState(profile?.bio || "");
  const [course,setCourse]=useState(profile?.course || "");
  const [year,setYear]=useState(profile?.year || "");
  const [avatarUrl,setAvatarUrl]=useState(profile?.avatar_url || "");
  const [avatarBusy,setAvatarBusy]=useState(false);

  useEffect(()=>{setName(profile?.display_name||"");setUsername(profile?.username||"");setBio(profile?.bio||"");setCourse(profile?.course||"");setYear(profile?.year||"");setAvatarUrl(profile?.avatar_url||"");},[profile]);

  const uploadAvatar=async(file)=>{
    if(!session||!file)return;
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){notifyProfile("Use JPG, PNG, WEBP or GIF.");return;}
    if(file.size>5*1024*1024){notifyProfile("Profile image must be 5 MB or smaller.");return;}
    setAvatarBusy(true);
    try{
      const ext=(file.name.split(".").pop()||"jpg").toLowerCase();
      const path=session.user.id+"/avatar."+ext;
      const {error:uploadError}=await supabase.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
      if(uploadError)throw uploadError;
      const {data}=supabase.storage.from("avatars").getPublicUrl(path);
      const url=data.publicUrl+"?v="+Date.now();
      const {error:updateError}=await supabase.from("profiles").update({avatar_url:url,updated_at:new Date().toISOString()}).eq("id",session.user.id);
      if(updateError)throw updateError;
      setAvatarUrl(url);notifyProfile("Profile image updated");window.location.reload();
    }catch(e){notifyProfile(e.message||"Could not upload profile image");}
    finally{setAvatarBusy(false);}
  };

  const removeAvatar=async()=>{
    if(!session||!avatarUrl)return;
    setAvatarBusy(true);
    try{
      const base=avatarUrl.split("?")[0];
      const oldPath=base.split("/storage/v1/object/public/avatars/")[1];
      if(oldPath)await supabase.storage.from("avatars").remove([oldPath]);
      const {error}=await supabase.from("profiles").update({avatar_url:null,updated_at:new Date().toISOString()}).eq("id",session.user.id);
      if(error)throw error;
      setAvatarUrl("");notifyProfile("Profile image removed");window.location.reload();
    }catch(e){notifyProfile(e.message||"Could not remove profile image");}
    finally{setAvatarBusy(false);}
  };

  const saveProfile=async()=>{
    if(!session)return;
    const {error}=await supabase.from("profiles").update({
      display_name:name.trim()||null,
      username:username.trim()||null,
      bio:bio.trim()||null,
      course:course.trim()||null,
      year:year.trim()||null,
      updated_at:new Date().toISOString()
    }).eq("id",session.user.id);
    if(error){notifyProfile(error.message);return;}
    setEditing(false); notifyProfile("Profile updated"); window.location.reload();
  };

  const display=profile?.display_name || session?.user?.email?.split("@")[0] || "Campus member";
  const initials=initialsFromName(display);

  return <div className="profile-page">
    <section className="profile-hero"><div className="avatar profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : initials}</div><div className="profile-copy"><span className="eyebrow">CAMPUS IDENTITY</span><h1>{display}</h1><p>{profile?.username ? "@"+profile.username+" · " : ""}{course || "Student"}{year ? " · "+year : ""}</p></div><button className="ghost-btn" onClick={()=>setEditing(true)}><Settings size={16}/> Edit profile</button></section>
    <div className="profile-stats"><div><strong>{joined.length}</strong><span>Communities</span></div><div><strong>{profile?.postCount ?? 0}</strong><span>Posts</span></div><div><strong>{profile?.commentCount ?? 0}</strong><span>Comments</span></div><div><strong>{profile?.karma ?? 0}</strong><span>Karma</span></div></div>
    <div className="profile-grid"><div className="right-card"><div className="card-heading"><h3><Users size={17}/> Your communities</h3><button onClick={onExplore}>Explore</button></div>{joined.map(name => { const c=communities.find(x=>x.name===name); return c ? <CommunityRow key={name} c={c} joined toggle={()=>{}}/> : null; })}{!joined.length&&<div className="tiny">Join communities to build your feed.</div>}</div><div className="right-card profile-actions"><h3>Quick actions</h3><button onClick={onCreate}><Plus size={16}/> Create a post</button><button onClick={onExplore}><Compass size={16}/> Discover communities</button></div></div>
    {editing && <div className="modal-backdrop" onMouseDown={()=>setEditing(false)}><div className="profile-edit-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setEditing(false)} aria-label="Close edit profile"><X size={18}/></button><div className="profile-edit-head"><div className="info-icon"><UserRound size={22}/></div><div><h2>Edit profile</h2><p>Keep your campus identity up to date.</p></div></div><div className="profile-edit-form"><div className="profile-avatar-editor"><div className="avatar profile-avatar edit-avatar">{avatarUrl ? <img src={avatarUrl} alt="Profile preview" /> : initials}</div><div><strong>Profile photo</strong><p>Use a clear photo. JPG, PNG, WEBP or GIF, up to 5 MB.</p><div className="avatar-actions"><label className="ghost-btn upload-avatar-btn">{avatarBusy ? "Uploading…" : "Choose image"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={avatarBusy} onChange={e=>{const f=e.target.files?.[0];if(f)uploadAvatar(f);e.target.value="";}} /></label>{avatarUrl&&<button className="ghost-btn" disabled={avatarBusy} onClick={removeAvatar}>Remove</button>}</div></div></div><label className="profile-edit-field"><span>Display name</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your display name" maxLength="60" /></label><label className="profile-edit-field"><span>Username</span><input value={username} onChange={e=>setUsername(e.target.value.replace(/\s/g,"").toLowerCase())} placeholder="your_username" maxLength="30" /><small className="profile-edit-hint">Letters, numbers and underscores work best.</small></label><label className="profile-edit-field"><span>Course</span><input value={course} onChange={e=>setCourse(e.target.value)} placeholder="e.g. ECE" maxLength="50" /></label><label className="profile-edit-field"><span>Year</span><input value={year} onChange={e=>setYear(e.target.value)} placeholder="e.g. 2nd Year" maxLength="30" /></label><label className="profile-edit-field full"><span>Bio</span><textarea value={bio} onChange={e=>setBio(e.target.value)} rows="4" placeholder="Tell your campus community a little about you..." maxLength="300" /></label></div><div className="profile-edit-actions"><button className="ghost-btn" onClick={()=>setEditing(false)}>Cancel</button><button className="primary-btn" onClick={saveProfile}>Save profile</button></div></div></div>}
  </div>;
}

function notifyProfile(message) {
  window.dispatchEvent(new CustomEvent("campusverse:toast", { detail: message }));
}

function Explore({communities,joined,toggleJoin,onCreate}) { return <><div className="explore-head"><span className="eyebrow"><Compass size={14}/> DISCOVER</span><h1>Find your corner of campus.</h1><p>Communities are the rooms of CampusVerse. Join the ones that feel like home.</p><button className="primary-btn" onClick={onCreate}><Plus size={17}/> Start a conversation</button></div><div className="community-grid">{communities.map(c => <div className="explore-card" key={c.name}><div className="explore-icon" style={{background:c.color+"18"}}>{c.icon}</div><div><h3>r/{c.name}</h3><p>{c.label}</p><small>{c.members} members</small></div><button className={joined.includes(c.name) ? "joined-btn" : "join-btn"} onClick={() => toggleJoin(c.name)}>{joined.includes(c.name) ? "Joined" : "Join"}</button></div>)}</div></>; }

function EmptyState({onCreate,title="No posts here yet"}) { return <div className="empty"><div>🛰️</div><h3>{title}</h3><p>Be the person who starts the conversation.</p><button className="primary-btn" onClick={onCreate}><Plus size={17}/> Create a post</button></div>; }

function Composer({communities,onClose,onCreate}) { const [community,setCommunity]=useState("campus"); const [title,setTitle]=useState(""); const [body,setBody]=useState(""); const [file,setFile]=useState(null); const [imageAdded,setImageAdded]=useState(false); const [spoiler,setSpoiler]=useState(false); const valid=title.trim().length>3; return <div className="modal-backdrop" onMouseDown={onClose}><div className="composer" onMouseDown={e=>e.stopPropagation()}><div className="composer-head"><div><span className="eyebrow">CREATE</span><h2>Start a conversation</h2></div><button onClick={onClose}><X/></button></div><label>Community<select value={community} onChange={e=>setCommunity(e.target.value)}>{communities.map(c=><option value={c.name} key={c.name}>r/{c.name}</option>)}</select></label><label>Title<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="What's on your mind?" maxLength={140}/><small>{title.length}/140</small></label><label>Body<textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Add context, a question, a story, or just say hello..." rows="6"/></label><div className="composer-tools"><label className={`composer-image-btn ${imageAdded?"tool-active":""}`}><Image size={18}/> {imageAdded ? file?.name || "Image added" : "Add image"}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0]; if(f){setFile(f);setImageAdded(true);}}}/></label><button className={spoiler?"tool-active":""} onClick={()=>setSpoiler(!spoiler)}><ShieldCheck size={18}/> {spoiler?"Spoiler on":"Spoiler"}</button><button onClick={()=>setBody(b=>b+"\n\n#poll ")}><MoreHorizontal size={18}/> Add tag</button><span>{spoiler ? "Spoiler enabled" : "Markdown supported"}</span></div><div className="composer-foot"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={!valid} onClick={()=>onCreate({community,title,body,file})}>Publish post</button></div></div></div>; }

function LoginModal({onClose,onDone}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState("login");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const valid=email.includes("@") && password.length>=6;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setError("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: email.trim().split("@")[0] } } });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === "signup" && !result.data.session) {
      setError("Account created. Check your email to confirm your account, then log in.");
      return;
    }
    onDone();
  };

  return <div className="modal-backdrop auth-modal-backdrop" onMouseDown={onClose}><div className="login-modal" onMouseDown={e=>e.stopPropagation()}>
    <button className="modal-x" onClick={onClose}><X size={18}/></button><div className="login-mark">C</div>
    <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
    <p>{mode === "login" ? "Continue your campus conversations." : "Use your email to get started."}</p>
    <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@university.edu" autoComplete="email"/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "login" ? "current-password" : "new-password"}/></label>
    {error && <div className="tiny" style={{marginTop:8}}>{error}</div>}
    <button className="primary-btn wide" disabled={!valid || busy} onClick={submit}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
    <button className="mode-switch" onClick={()=>{setMode(mode === "login" ? "signup" : "login");setError("");}}>{mode === "login" ? "Need an account? Create one" : "Already have an account? Log in"}</button>
    <button className="ghost-btn" style={{marginTop:8}} onClick={onClose}>Maybe later</button>
  </div></div>;
}
function CommentsModal({post,onClose,onRefresh,session,onLogin}) {
  const [body,setBody]=useState("");
  const [items,setItems]=useState([]);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{ supabase.from("comments").select("id,body,created_at,author_id").eq("post_id",post.id).order("created_at",{ascending:true}).then(async ({data,error})=>{
    if(error)return;
    const ids=[...(new Set((data||[]).map(x=>x.author_id).filter(Boolean)))];
    let prof=[];
    if(ids.length){const r=await supabase.from("profiles").select("id,username,display_name").in("id",ids);prof=r.data||[];}
    const pm=new Map(prof.map(p=>[p.id,p]));
    setItems((data||[]).map(c=>({author:pm.get(c.author_id)?.username||pm.get(c.author_id)?.display_name||"Campus member",avatar:(pm.get(c.author_id)?.display_name||"CM").slice(0,2).toUpperCase(),text:c.body,time:""})));
  });},[post.id]);
  const submit=async()=>{if(!body.trim())return;if(!session){onLogin();return;}setBusy(true);try{await addCampusComment({postId:post.id,userId:session.user.id,body});setBody("");await onRefresh();const r=await supabase.from("comments").select("id,body,created_at,author_id").eq("post_id",post.id).order("created_at",{ascending:true});const ids=[...(new Set((r.data||[]).map(x=>x.author_id).filter(Boolean)))];let prof=[];if(ids.length){const pr=await supabase.from("profiles").select("id,username,display_name").in("id",ids);prof=pr.data||[];}const pm=new Map(prof.map(p=>[p.id,p]));setItems((r.data||[]).map(c=>({author:pm.get(c.author_id)?.username||pm.get(c.author_id)?.display_name||"Campus member",avatar:(pm.get(c.author_id)?.display_name||"CM").slice(0,2).toUpperCase(),text:c.body,time:""})));}catch(e){notifyProfile(e.message||"Could not comment");}finally{setBusy(false);}};
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="comments-modal" onMouseDown={e=>e.stopPropagation()}><div className="composer-head"><div><span className="eyebrow">DISCUSSION</span><h2>{items.length} comments</h2></div><button onClick={onClose}><X/></button></div><div className="comment-post"><strong>{post.title}</strong><p>{post.body}</p></div><div className="comments-list">{items.length?items.map((c,i)=><div className="comment" key={i}><span className="avatar">{c.avatar}</span><div><b>u/{c.author}</b><small>{c.time}</small><p>{c.text}</p></div></div>):<div className="tiny">No comments yet. Start the discussion.</div>}</div><div style={{display:"flex",gap:8,marginTop:14}}><input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit();}}} placeholder={session?"Add a comment…":"Log in to comment"} style={{flex:1}}/><button className="primary-btn" disabled={busy||!body.trim()} onClick={submit}>{busy?"…":"Comment"}</button></div></div></div>;
}

function PostMenu({post,onClose,onShare,onSave,onReport}) { return <div className="modal-backdrop subtle" onMouseDown={onClose}><div className="post-menu-modal" onMouseDown={e=>e.stopPropagation()}><div className="menu-title"><strong>Post options</strong><button onClick={onClose}><X size={18}/></button></div><p>{post.title}</p><button onClick={onSave}><Bookmark size={17}/> {post.saved ? "Remove from saved" : "Save post"}</button><button onClick={onShare}><Send size={17}/> Share post</button><button onClick={onReport} className="danger"><Flag size={17}/> Report post</button></div></div>; }

function InfoModal({type,onClose}) { const data={about:["About CampusVerse","A university-first community for conversations, questions, discoveries and campus life."],rules:["Community rules","Be respectful. No harassment, spam, impersonation, doxxing or harmful content. Keep posts relevant to campus."],privacy:["Privacy","Profile and content access are protected by database access policies."],help:["Help center","Authentication, reporting and account controls are connected to the campus backend."],settings:["Settings","Manage your account and notification preferences here."]}[type] || ["CampusVerse","Welcome."]; return <div className="modal-backdrop" onMouseDown={onClose}><div className="info-modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={onClose}><X size={18}/></button><div className="info-icon"><Info size={22}/></div><h2>{data[0]}</h2><p>{data[1]}</p><div className="info-row"><ShieldCheck size={16}/><span>Use reporting and community controls to keep discussions useful and respectful.</span></div><button className="primary-btn wide" onClick={onClose}>Close</button></div></div>; }

createRoot(document.getElementById("root")).render(<App />);