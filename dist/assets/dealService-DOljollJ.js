import{s as i}from"./index-Dw0MYWtY.js";const S={pending:"Chờ xử lý",processing:"Đang xử lý",accepted:"Đã duyệt",settled:"Đã quyết toán",cancelled:"Đã hủy"},k={pending:"orange",processing:"blue",accepted:"green",settled:"purple",cancelled:"default"},A={purchase:"Mua hàng",sale:"Bán hàng",processing:"Gia công",consignment:"Ký gửi"},E={purchase:"cyan",sale:"green",processing:"orange",consignment:"purple"},b=()=>{const e=new Date,t=e.getFullYear().toString().slice(-2),r=(e.getMonth()+1).toString().padStart(2,"0"),n=Math.random().toString(36).substring(2,6).toUpperCase();return`DL${t}${r}-${n}`},v={async getDeals(e={}){const{page:t=1,pageSize:r=10,search:n,status:a,partner_id:o,deal_type:_,date_from:p,date_to:u,sort_by:y="created_at",sort_order:m="desc"}=e,d=(t-1)*r,f=d+r-1;let s=i.from("b2b_deals").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email
        )
      `,{count:"exact"});a&&a!=="all"&&(s=s.eq("status",a)),o&&(s=s.eq("partner_id",o)),_&&_!=="all"&&(s=s.eq("deal_type",_)),p&&(s=s.gte("created_at",p)),u&&(s=s.lte("created_at",u)),n&&(s=s.ilike("deal_number",`%${n}%`)),s=s.order(y,{ascending:m==="asc"});const{data:h,error:l,count:g}=await s.range(d,f);if(l)throw l;return{data:(h||[]).map(c=>({...c,partner:Array.isArray(c.partner)?c.partner[0]:c.partner,quantity_tons:c.quantity_kg?c.quantity_kg/1e3:0})),total:g||0,page:t,pageSize:r,totalPages:Math.ceil((g||0)/r)}},async getAllDeals(e){let t=i.from("b2b_deals").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `).order("created_at",{ascending:!1});e&&(t=t.eq("partner_id",e));const{data:r,error:n}=await t;if(n)throw n;return(r||[]).map(a=>({...a,partner:Array.isArray(a.partner)?a.partner[0]:a.partner,quantity_tons:a.quantity_kg?a.quantity_kg/1e3:0}))},async getDealById(e){const{data:t,error:r}=await i.from("b2b_deals").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone, email, address
        )
      `).eq("id",e).maybeSingle();if(r)throw r;return t?{...t,partner:Array.isArray(t.partner)?t.partner[0]:t.partner,quantity_tons:t.quantity_kg?t.quantity_kg/1e3:0}:null},async getDealByNumber(e){const{data:t,error:r}=await i.from("b2b_deals").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `).eq("deal_number",e).maybeSingle();if(r)throw r;return t?{...t,partner:Array.isArray(t.partner)?t.partner[0]:t.partner,quantity_tons:t.quantity_kg?t.quantity_kg/1e3:0}:null},async createDeal(e){const t=b();let r=e.total_value_vnd;!r&&e.quantity_kg&&e.unit_price&&(r=e.quantity_kg*e.unit_price);const{data:n,error:a}=await i.from("b2b_deals").insert({deal_number:t,partner_id:e.partner_id,deal_type:e.deal_type||"purchase",warehouse_id:e.warehouse_id,product_name:e.product_name,product_code:e.product_code,quantity_kg:e.quantity_kg,unit_price:e.unit_price,total_value_vnd:r,currency:e.currency||"VND",status:"pending",delivery_terms:e.delivery_terms,processing_fee_per_ton:e.processing_fee_per_ton,expected_output_rate:e.expected_output_rate,notes:e.notes,booking_id:e.booking_id}).select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `).single();if(a)throw a;return{...n,partner:Array.isArray(n.partner)?n.partner[0]:n.partner,quantity_tons:n.quantity_kg?n.quantity_kg/1e3:0}},async createDealFromBooking(e,t){if(t.booking_message_id){const a=await this.getDealByBookingId(t.booking_message_id);if(a)return a}const n={mu_nuoc:"Mủ nước",mu_tap:"Mủ tạp",mu_dong:"Mủ đông",mu_chen:"Mủ chén",mu_to:"Mủ tờ"}[t.product_type]||t.product_type;return this.createDeal({partner_id:e,deal_type:"purchase",product_name:n,product_code:t.product_type,quantity_kg:t.quantity_tons*1e3,unit_price:t.price_per_kg,total_value_vnd:t.quantity_tons*1e3*t.price_per_kg,notes:`DRC: ${t.drc_percent}%. Tạo tự động từ phiếu chốt mủ.`,booking_id:t.booking_message_id})},async getDealByBookingId(e){const{data:t,error:r}=await i.from("b2b_deals").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `).eq("booking_id",e).maybeSingle();return r?(console.error("Error checking existing deal for booking:",r),null):t?{...t,partner:Array.isArray(t.partner)?t.partner[0]:t.partner,quantity_tons:t.quantity_kg?t.quantity_kg/1e3:0}:null},async updateDeal(e,t){const{data:r,error:n}=await i.from("b2b_deals").update({...t,updated_at:new Date().toISOString()}).eq("id",e).select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier
        )
      `).single();if(n)throw n;return{...r,partner:Array.isArray(r.partner)?r.partner[0]:r.partner,quantity_tons:r.quantity_kg?r.quantity_kg/1e3:0}},async updateStatus(e,t){return this.updateDeal(e,{status:t})},async startProcessing(e){return this.updateStatus(e,"processing")},async acceptDeal(e,t){return this.updateDeal(e,{status:"accepted",final_price:t})},async settleDeal(e){return this.updateStatus(e,"settled")},async cancelDeal(e,t){return this.updateDeal(e,{status:"cancelled",notes:t})},async deleteDeal(e){const t=await this.getDealById(e);if(!t)throw new Error("Deal không tồn tại");if(t.status!=="pending")throw new Error('Chỉ có thể xóa deal ở trạng thái "Chờ xử lý"');const{error:r}=await i.from("b2b_deals").delete().eq("id",e);if(r)throw r},async getStatsByStatus(){const{data:e,error:t}=await i.from("b2b_deals").select("status");if(t)throw t;const r={pending:0,processing:0,accepted:0,settled:0,cancelled:0};return(e||[]).forEach(a=>{a.status&&r[a.status]!==void 0&&r[a.status]++}),r},async getStatsByPartner(e){const{data:t,error:r}=await i.from("b2b_deals").select("status, quantity_kg, total_value_vnd").eq("partner_id",e);if(r)throw r;const n={total:t?.length||0,pending:0,processing:0,accepted:0,settled:0,totalValue:0,totalQuantity:0};return(t||[]).forEach(o=>{o.status==="pending"&&n.pending++,o.status==="processing"&&n.processing++,o.status==="accepted"&&n.accepted++,o.status==="settled"&&n.settled++,n.totalValue+=o.total_value_vnd||0,n.totalQuantity+=(o.quantity_kg||0)/1e3}),n},async getChatRoomByDeal(e){const{data:t,error:r}=await i.from("b2b_chat_rooms").select("id").eq("deal_id",e).eq("is_active",!0).maybeSingle();if(r)throw r;return t},async getChatRoomByPartner(e){const{data:t,error:r}=await i.from("b2b_chat_rooms").select("id").eq("partner_id",e).eq("room_type","general").eq("is_active",!0).maybeSingle();if(r)throw r;return t}};export{S as D,k as a,A as b,E as c,v as d};
