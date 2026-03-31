import{s as a}from"./index-pMENhkRL.js";const f={diamond:"Kim cương",gold:"Vàng",silver:"Bạc",bronze:"Đồng",new:"Mới"},w={async getRooms(t={}){const e=t.page||1,r=t.pageSize||20,{search:n,filter:p,room_type:i}=t,c=(e-1)*r,m=c+r-1;let o=a.from("b2b_chat_rooms").select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `,{count:"exact"}).eq("is_active",!0);i&&i!=="all"&&(o=o.eq("room_type",i)),n&&(o=o.or(`room_name.ilike.%${n}%`)),o=o.order("last_message_at",{ascending:!1,nullsFirst:!1});const{data:g,error:l,count:d}=await o.range(c,m);if(l)throw l;const u=await Promise.all((g||[]).map(async s=>{const b=await this.getUnreadCountByRoom(s.id),h=await this.getLastMessage(s.id);return{...s,partner:Array.isArray(s.partner)?s.partner[0]:s.partner,unread_count:b,last_message:h}}));let _=u;return p==="unread"&&(_=u.filter(s=>(s.unread_count||0)>0)),{data:_,total:d||0,page:e,pageSize:r,totalPages:Math.ceil((d||0)/r)}},async getAllActive(){const{data:t,error:e}=await a.from("b2b_chat_rooms").select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `).eq("is_active",!0).order("last_message_at",{ascending:!1,nullsFirst:!1});if(e)throw e;return(t||[]).map(r=>({...r,partner:Array.isArray(r.partner)?r.partner[0]:r.partner}))},async getById(t){const{data:e,error:r}=await a.from("b2b_chat_rooms").select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `).eq("id",t).maybeSingle();if(r)throw r;if(!e)return null;const n=await this.getUnreadCountByRoom(t);return{...e,partner:Array.isArray(e.partner)?e.partner[0]:e.partner,unread_count:n}},async getByPartnerId(t){const{data:e,error:r}=await a.from("b2b_chat_rooms").select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `).eq("partner_id",t).eq("room_type","general").eq("is_active",!0).maybeSingle();if(r)throw r;return e?{...e,partner:Array.isArray(e.partner)?e.partner[0]:e.partner}:null},async create(t){if(t.room_type==="general"){const n=await this.getByPartnerId(t.partner_id);if(n)return n}const{data:e,error:r}=await a.from("b2b_chat_rooms").insert({...t,status:"active",is_active:!0,message_count:0}).select(`
        *,
        partner:b2b_partners!partner_id (
          id,
          code,
          name,
          tier,
          phone,
          email
        )
      `).single();if(r)throw r;return{...e,partner:Array.isArray(e.partner)?e.partner[0]:e.partner}},async closeRoom(t){const{error:e}=await a.from("b2b_chat_rooms").update({status:"closed"}).eq("id",t);if(e)throw e},async reopenRoom(t){const{error:e}=await a.from("b2b_chat_rooms").update({status:"active"}).eq("id",t);if(e)throw e},async getUnreadCountByRoom(t){const{count:e,error:r}=await a.from("b2b_chat_messages").select("id",{count:"exact",head:!0}).eq("room_id",t).eq("sender_type","partner").is("read_at",null).is("deleted_at",null);return r?(console.error("Error counting unread:",r),0):e||0},async getTotalUnreadCount(){const{count:t,error:e}=await a.from("b2b_chat_messages").select("id",{count:"exact",head:!0}).eq("sender_type","partner").is("read_at",null).is("deleted_at",null);return e?(console.error("Error counting total unread:",e),0):t||0},async getLastMessage(t){const{data:e,error:r}=await a.from("b2b_chat_messages").select("content, sender_type, sent_at, message_type").eq("room_id",t).is("deleted_at",null).order("sent_at",{ascending:!1}).limit(1).maybeSingle();return r||!e?null:{content:e.content,sender_type:e.sender_type,sent_at:e.sent_at,message_type:e.message_type}},subscribeToRooms(t){return a.channel("b2b-chat-rooms").on("postgres_changes",{event:"*",schema:"b2b",table:"chat_rooms"},e=>{t({eventType:e.eventType,new:e.new,old:e.old})}).subscribe()},subscribeToMessages(t){return a.channel("b2b-chat-messages-all").on("postgres_changes",{event:"INSERT",schema:"b2b",table:"chat_messages"},e=>{t({eventType:e.eventType,new:e.new,old:e.old})}).subscribe()},async getStatsByTier(){const t=await this.getAllActive(),e={diamond:0,gold:0,silver:0,bronze:0,new:0};return t.forEach(r=>{r.partner?.tier&&e[r.partner.tier]++}),e},async getRoomsWithUnread(){const t=await this.getAllActive();return(await Promise.all(t.map(async r=>{const n=await this.getUnreadCountByRoom(r.id);return{...r,unread_count:n}}))).filter(r=>(r.unread_count||0)>0)}};export{f as T,w as c};
