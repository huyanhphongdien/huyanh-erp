import{s}from"./index-C_-CwTyQ.js";const A={pending:"Chờ duyệt",approved:"Đã duyệt",paid:"Đã chi",rejected:"Từ chối"},S={pending:"orange",approved:"green",paid:"blue",rejected:"red"},f=()=>{const t=new Date,r=t.getFullYear().toString().slice(-2),e=(t.getMonth()+1).toString().padStart(2,"0"),a=Math.random().toString(36).substring(2,6).toUpperCase();return`TU${r}${e}-${a}`},q={async getAdvances(t={}){const{page:r=1,pageSize:e=10,search:a,status:n,partner_id:i,deal_id:o,date_from:p,date_to:_,sort_by:g="created_at",sort_order:y="desc"}=t,u=(r-1)*e,b=u+e-1;let d=s.from("b2b_advances").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `,{count:"exact"});n&&n!=="all"&&(d=d.eq("status",n)),i&&(d=d.eq("partner_id",i)),o&&(d=d.eq("deal_id",o)),p&&(d=d.gte("payment_date",p)),_&&(d=d.lte("payment_date",_)),a&&(d=d.ilike("advance_number",`%${a}%`)),d=d.order(g,{ascending:y==="asc"});const{data:h,error:l,count:m}=await d.range(u,b);if(l)throw l;return{data:(h||[]).map(c=>({...c,partner:Array.isArray(c.partner)?c.partner[0]:c.partner,deal:Array.isArray(c.deal)?c.deal[0]:c.deal})),total:m||0,page:r,pageSize:e,totalPages:Math.ceil((m||0)/e)}},async getAdvanceById(t){const{data:r,error:e}=await s.from("b2b_advances").select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).eq("id",t).maybeSingle();if(e)throw e;return r?{...r,partner:Array.isArray(r.partner)?r.partner[0]:r.partner,deal:Array.isArray(r.deal)?r.deal[0]:r.deal}:null},async getAdvancesByPartner(t){const{data:r,error:e}=await s.from("b2b_advances").select(`
        *,
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).eq("partner_id",t).order("payment_date",{ascending:!1});if(e)throw e;return(r||[]).map(a=>({...a,deal:Array.isArray(a.deal)?a.deal[0]:a.deal}))},async getAdvancesByDeal(t){const{data:r,error:e}=await s.from("b2b_advances").select("*").eq("deal_id",t).order("payment_date",{ascending:!1});if(e)throw e;return r||[]},async getUnlinkedAdvances(t){const{data:r,error:e}=await s.from("b2b_advances").select("*").eq("partner_id",t).eq("status","paid").order("payment_date",{ascending:!1});if(e)throw e;const{data:a}=await s.from("b2b_settlement_advances").select("advance_id"),n=new Set((a||[]).map(i=>i.advance_id));return(r||[]).filter(i=>!n.has(i.id))},async createAdvance(t){const r=f(),{data:e,error:a}=await s.from("b2b_advances").insert({advance_number:r,deal_id:t.deal_id,partner_id:t.partner_id,amount:t.amount,currency:t.currency||"VND",exchange_rate:t.exchange_rate,amount_vnd:t.amount_vnd||t.amount,payment_date:t.payment_date,payment_method:t.payment_method,bank_reference:t.bank_reference,purpose:t.purpose,status:"pending",requested_by:t.requested_by}).select(`
        *,
        partner:b2b_partners!partner_id (
          id, code, name, tier, phone
        ),
        deal:b2b_deals!deal_id (
          id, deal_number, product_name
        )
      `).single();if(a)throw a;return{...e,partner:Array.isArray(e.partner)?e.partner[0]:e.partner,deal:Array.isArray(e.deal)?e.deal[0]:e.deal}},async approveAdvance(t,r){const e=await this.getAdvanceById(t);if(!e)throw new Error("Phiếu tạm ứng không tồn tại");if(e.status!=="pending")throw new Error('Chỉ có thể duyệt phiếu tạm ứng ở trạng thái "Chờ duyệt"');const{data:a,error:n}=await s.from("b2b_advances").update({status:"approved",approved_by:r,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",t).select("*").single();if(n)throw n;return a},async markPaid(t,r,e){const a=await this.getAdvanceById(t);if(!a)throw new Error("Phiếu tạm ứng không tồn tại");if(a.status!=="approved")throw new Error('Chỉ có thể chi phiếu tạm ứng ở trạng thái "Đã duyệt"');const{data:n,error:i}=await s.from("b2b_advances").update({status:"paid",paid_by:r,paid_at:new Date().toISOString(),bank_reference:e,updated_at:new Date().toISOString()}).eq("id",t).select("*").single();if(i)throw i;try{const o=n;if(o?.deal_id&&o?.partner_id){const p=o.amount_vnd||o.amount||0;await s.from("b2b_partner_ledger").insert({partner_id:o.partner_id,entry_type:"advance",reference_type:"advance",reference_id:t,description:`Tạm ứng ${o.advance_number} cho Deal`,debit:0,credit:p,entry_date:new Date().toISOString().split("T")[0],period_month:new Date().getMonth()+1,period_year:new Date().getFullYear()})}}catch(o){console.error("Ledger entry for advance failed:",o)}return n},async rejectAdvance(t){const{data:r,error:e}=await s.from("b2b_advances").update({status:"rejected",updated_at:new Date().toISOString()}).eq("id",t).select("*").single();if(e)throw e;return r},async deleteAdvance(t){const r=await this.getAdvanceById(t);if(!r)throw new Error("Phiếu tạm ứng không tồn tại");if(r.status!=="pending")throw new Error('Chỉ có thể xóa phiếu tạm ứng ở trạng thái "Chờ duyệt"');const{error:e}=await s.from("b2b_advances").delete().eq("id",t);if(e)throw e},async getStatsByStatus(){const{data:t,error:r}=await s.from("b2b_advances").select("status");if(r)throw r;const e={pending:0,approved:0,paid:0,rejected:0};for(const a of t||[])a.status&&e[a.status]!==void 0&&e[a.status]++;return e},async getTotalByPartner(t){const{data:r,error:e}=await s.from("b2b_advances").select("amount, status").eq("partner_id",t);if(e)throw e;const a={total:0,paid:0,pending:0};for(const n of r||[])a.total+=n.amount||0,n.status==="paid"&&(a.paid+=n.amount||0),(n.status==="pending"||n.status==="approved")&&(a.pending+=n.amount||0);return a}};export{A,S as a,q as b};
