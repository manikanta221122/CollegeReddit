import { supabase } from "./supabaseClient";

export async function loadCampusData(userId) {
  const [{ data: communities, error: ce }, { data: posts, error: pe }] = await Promise.all([
    supabase.from("communities").select("*").order("created_at"),
    supabase.from("posts").select("id,community_id,author_id,title,body,tags,image_url,created_at,communities(name,label,icon,color)").order("created_at",{ascending:false})
  ]);
  if (ce) throw ce;
  if (pe) throw pe;
  const authorIds=[...new Set((posts||[]).map(p=>p.author_id).filter(Boolean))];
  let profiles=[];
  if(authorIds.length){
    const {data,error}=await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",authorIds);
    if(error) throw error;
    profiles=data||[];
  }
  const profileMap=new Map(profiles.map(p=>[p.id,p]));

  const [membersRes, savedRes, votesRes, commentsRes] = await Promise.all([
    supabase.from("community_members").select("community_id"),
    userId ? supabase.from("saved_posts").select("post_id").eq("user_id",userId) : Promise.resolve({data:[]}),
    userId ? supabase.from("post_votes").select("post_id,value").eq("user_id",userId) : Promise.resolve({data:[]}),
    supabase.from("comments").select("post_id")
  ]);
  if (membersRes.error) throw membersRes.error;
  if (savedRes.error) throw savedRes.error;
  if (votesRes.error) throw votesRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const memberCounts = {};
  (membersRes.data || []).forEach(x => { memberCounts[x.community_id]=(memberCounts[x.community_id]||0)+1; });
  const saved = new Set((savedRes.data||[]).map(x=>x.post_id));
  const votes = new Map((votesRes.data||[]).map(x=>[x.post_id,x.value]));
  const commentCounts = {};
  (commentsRes.data||[]).forEach(x => { commentCounts[x.post_id]=(commentCounts[x.post_id]||0)+1; });

  const mappedCommunities=(communities||[]).map(c=>({
    ...c, members: memberCounts[c.id] || "0", memberCount: memberCounts[c.id] || 0
  }));
  const mappedPosts=(posts||[]).map(p=>({
    id:p.id, community:p.communities?.name || "campus", title:p.title, body:p.body, imageUrl:p.image_url || "", authorId:p.author_id,
    author:profileMap.get(p.author_id)?.username || profileMap.get(p.author_id)?.display_name || "Campus Team",
    avatar:(profileMap.get(p.author_id)?.display_name || profileMap.get(p.author_id)?.username || "CT").slice(0,2).toUpperCase(),
    time:formatRelative(p.created_at), createdAt:p.created_at, votes:0, comments:commentCounts[p.id]||0,
    saved:saved.has(p.id), myVote:votes.get(p.id)||0, tags:p.tags||[],
    hot:false,
    communityLabel:p.communities?.label || p.communities?.name || "Campus",
    communityIcon:p.communities?.icon || "🏫",
    communityColor:p.communities?.color || "#f97316"
  }));

  if (mappedPosts.length) {
    const ids=mappedPosts.map(p=>p.id);
    const {data:allVotes,error:av}=await supabase.from("post_votes").select("post_id,value").in("post_id",ids);
    if(av) throw av;
    const totals={};
    (allVotes||[]).forEach(v=>{totals[v.post_id]=(totals[v.post_id]||0)+v.value;});
    mappedPosts.forEach(p=>{p.votes=totals[p.id]||0;p.hot=p.votes>5;});
  }
  return {communities:mappedCommunities,posts:mappedPosts};
}

function formatRelative(value){
  const d=new Date(value), seconds=Math.max(0,Math.floor((Date.now()-d.getTime())/1000));
  if(seconds<60) return "just now";
  const minutes=Math.floor(seconds/60); if(minutes<60) return minutes+"m ago";
  const hours=Math.floor(minutes/60); if(hours<24) return hours+"h ago";
  const days=Math.floor(hours/24); return days+"d ago";
}

export async function toggleCommunityMembership(communityId,userId,joined){
  if(!userId) throw new Error("Log in to join communities.");
  if(joined) {
    const {error}=await supabase.from("community_members").delete().eq("community_id",communityId).eq("user_id",userId);
    if(error) throw error;
  } else {
    const {error}=await supabase.from("community_members").insert({community_id:communityId,user_id:userId});
    if(error && error.code!=="23505") throw error;
  }
}

export async function createCampusPost({community,title,body,tags=[],userId,imageUrl=null}){
  if(!userId) throw new Error("Log in to publish a post.");
  const {data:c,error:ce}=await supabase.from("communities").select("id").eq("name",community).single();
  if(ce) throw ce;
  const {data,error}=await supabase.from("posts").insert({community_id:c.id,author_id:userId,title:title.trim(),body:body.trim(),tags,image_url:imageUrl}).select("id").single();
  if(error) throw error;
  return data;
}

export async function togglePostSave(postId,userId,saved){
  if(!userId) throw new Error("Log in to save posts.");
  if(saved) {
    const {error}=await supabase.from("saved_posts").delete().eq("post_id",postId).eq("user_id",userId);
    if(error) throw error;
  } else {
    const {error}=await supabase.from("saved_posts").insert({post_id:postId,user_id:userId});
    if(error && error.code!=="23505") throw error;
  }
}

export async function voteOnPost(postId,userId,currentVote,nextDirection){
  if(!userId) throw new Error("Log in to vote.");
  const next=currentVote === (nextDirection==="up"?1:-1) ? 0 : (nextDirection==="up"?1:-1);
  if(next===0){
    const {error}=await supabase.from("post_votes").delete().eq("post_id",postId).eq("user_id",userId);
    if(error) throw error;
  } else {
    const {error}=await supabase.from("post_votes").upsert({post_id:postId,user_id:userId,value:next,updated_at:new Date().toISOString()});
    if(error) throw error;
  }
}

export async function addCampusComment({postId,userId,body}){
  if(!userId) throw new Error("Log in to comment.");
  const {error}=await supabase.from("comments").insert({post_id:postId,author_id:userId,body:body.trim()});
  if(error) throw error;
}

export async function reportCampusPost({postId,userId,reason="other",details=""}){
  if(!userId) throw new Error("Log in to report a post.");
  const {error}=await supabase.from("reports").insert({post_id:postId,reporter_id:userId,reason,details});
  if(error) throw error;
}
