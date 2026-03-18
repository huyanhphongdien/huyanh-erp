import{s}from"./index-CkzPypjE.js";const A={pending:"Chờ duyệt",approved:"Đã duyệt",paid:"Đã chi",rejected:"Từ chối"},S={pending:"orange",approved:"green",paid:"blue",rejected:"red"},w=()=>{const a=new Date,t=a.getFullYear().toString().slice(-2),e=(a.getMonth()+1).toString().padStart(2,"0"),r=Math.random().toString(36).substring(2,6).toUpperCase();return`TU${t}${e}-${r}`},q={async getAdvances(a={}){const{page:t=1,pageSize:e=10,search:r,status:n,partner_id:i,deal_id:c,date_from:p,date_to:_,sort_by:b="created_at",sort_order:y="desc"}=a,l=(t-1)*e,f=l+e-1;let d=s.from("b2b_advances").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `,{count:"exact"});n&&n!=="all"&&(d=d.eq("status",n)),i&&(d=d.eq("partner_id",i)),c&&(d=d.eq("deal_id",c)),p&&(d=d.gte("payment_date",p)),_&&(d=d.lte("payment_date",_)),r&&(d=d.ilike("advance_number",`%${r}%`)),d=d.order(b,{ascending:y==="asc"});const{data:g,error:u,count:m}=await d.range(l,f);if(u)throw u;return{data:(g||[]).map(o=>({...o,partner:Array.isArray(o.partner)?o.partner[0]:o.partner,deal:Array.isArray(o.deal)?o.deal[0]:o.deal})),total:m||0,page:t,pageSize:e,totalPages:Math.ceil((m||0)/e)}},async getAdvanceById(a){const{data:t,error:e}=await s.from("b2b_advances").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).eq("id",a).maybeSingle();if(e)throw e;return t?{...t,partner:Array.isArray(t.partner)?t.partner[0]:t.partner,deal:Array.isArray(t.deal)?t.deal[0]:t.deal}:null},async getAdvancesByPartner(a){const{data:t,error:e}=await s.from("b2b_advances").select(`
        *,
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).eq("partner_id",a).order("payment_date",{ascending:!1});if(e)throw e;return(t||[]).map(r=>({...r,deal:Array.isArray(r.deal)?r.deal[0]:r.deal}))},async getAdvancesByDeal(a){const{data:t,error:e}=await s.from("b2b_advances").select("*").eq("deal_id",a).order("payment_date",{ascending:!1});if(e)throw e;return t||[]},async getUnlinkedAdvances(a){const{data:t,error:e}=await s.from("b2b_advances").select("*").eq("partner_id",a).eq("status","paid").order("payment_date",{ascending:!1});if(e)throw e;const{data:r}=await s.from("b2b_settlement_advances").select("advance_id"),n=new Set((r||[]).map(i=>i.advance_id));return(t||[]).filter(i=>!n.has(i.id))},async createAdvance(a){const t=w(),{data:e,error:r}=await s.from("b2b_advances").insert({advance_number:t,deal_id:a.deal_id,partner_id:a.partner_id,amount:a.amount,currency:a.currency||"VND",exchange_rate:a.exchange_rate,amount_vnd:a.amount_vnd||a.amount,payment_date:a.payment_date,payment_method:a.payment_method,bank_reference:a.bank_reference,purpose:a.purpose,status:"pending",requested_by:a.requested_by}).select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).single();if(r)throw r;return{...e,partner:Array.isArray(e.partner)?e.partner[0]:e.partner,deal:Array.isArray(e.deal)?e.deal[0]:e.deal}},async approveAdvance(a,t){const{data:e,error:r}=await s.from("b2b_advances").update({status:"approved",approved_by:t,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",a).select("*").single();if(r)throw r;return e},async markPaid(a,t,e){const{data:r,error:n}=await s.from("b2b_advances").update({status:"paid",paid_by:t,paid_at:new Date().toISOString(),bank_reference:e,updated_at:new Date().toISOString()}).eq("id",a).select("*").single();if(n)throw n;return r},async rejectAdvance(a){const{data:t,error:e}=await s.from("b2b_advances").update({status:"rejected",updated_at:new Date().toISOString()}).eq("id",a).select("*").single();if(e)throw e;return t},async deleteAdvance(a){const t=await this.getAdvanceById(a);if(!t)throw new Error("Phiếu tạm ứng không tồn tại");if(t.status!=="pending")throw new Error('Chỉ có thể xóa phiếu tạm ứng ở trạng thái "Chờ duyệt"');const{error:e}=await s.from("b2b_advances").delete().eq("id",a);if(e)throw e},async getStatsByStatus(){const{data:a,error:t}=await s.from("b2b_advances").select("status");if(t)throw t;const e={pending:0,approved:0,paid:0,rejected:0};for(const r of a||[])r.status&&e[r.status]!==void 0&&e[r.status]++;return e},async getTotalByPartner(a){const{data:t,error:e}=await s.from("b2b_advances").select("amount, status").eq("partner_id",a);if(e)throw e;const r={total:0,paid:0,pending:0};for(const n of t||[])r.total+=n.amount||0,n.status==="paid"&&(r.paid+=n.amount||0),(n.status==="pending"||n.status==="approved")&&(r.pending+=n.amount||0);return r}};export{A,S as a,q as b};
