import{s as _}from"./index-DaI5XymV.js";const u="rubber_intake_batches",p=`
  *,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`,w=`
  id, source_type, intake_date, supplier_id, product_code,
  settled_qty_ton, settled_price_per_ton,
  purchase_qty_kg, unit_price, price_currency, total_amount,
  gross_weight_kg, net_weight_kg, drc_percent, finished_product_ton,
  avg_unit_price,
  invoice_no, vehicle_plate, vehicle_label,
  location_name, buyer_name,
  exchange_rate, total_amount_vnd,
  status, payment_status, paid_amount,
  notes, created_by, created_at, updated_at,
  supplier:rubber_suppliers(id, code, name, phone, country, supplier_type)
`,E={async getAll(n={}){const{page:i=1,pageSize:t=20,search:a,status:c,supplier_id:r,rubber_supplier_id:o,source_type:d,from_date:f,to_date:g,payment_status:l,product_code:m}=n,y=(i-1)*t,q=y+t-1;let e=_.from(u).select(w,{count:"exact"});c&&c!=="all"&&(e=e.eq("status",c));const h=r||o;if(h&&(e=e.eq("supplier_id",h)),d&&d!=="all"&&(e=e.eq("source_type",d)),l&&l!=="all"&&(e=e.eq("payment_status",l)),m&&(e=e.ilike("product_code",`%${m}%`)),f&&(e=e.gte("intake_date",f)),g&&(e=e.lte("intake_date",g)),a&&a.trim()){const s=a.trim();e=e.or(`product_code.ilike.%${s}%,invoice_no.ilike.%${s}%,vehicle_plate.ilike.%${s}%,vehicle_label.ilike.%${s}%,location_name.ilike.%${s}%,buyer_name.ilike.%${s}%`)}e=e.order("intake_date",{ascending:!1}).order("created_at",{ascending:!1}).range(y,q);const{data:S,count:v,error:k}=await e;if(k)throw k;const b=v??0;return{data:S||[],total:b,page:i,pageSize:t,totalPages:Math.ceil(b/t)}},async getById(n){const{data:i,error:t}=await _.from(u).select(p).eq("id",n).single();if(t){if(t.code==="PGRST116")return null;throw t}return i},async confirm(n){const{data:i,error:t}=await _.from(u).update({status:"confirmed",updated_at:new Date().toISOString()}).eq("id",n).eq("status","draft").select(p).single();if(t)throw t;return i},async cancel(n){const{data:i,error:t}=await _.from(u).update({status:"cancelled",updated_at:new Date().toISOString()}).eq("id",n).eq("status","draft").select(p).single();if(t)throw t;return i},async getDailyReport(n){const{data:i,error:t}=await _.from(u).select(w).eq("intake_date",n).neq("status","cancelled").order("created_at",{ascending:!0});if(t)throw t;const a=i||[],c=new Set(a.map(r=>r.supplier_id).filter(Boolean));return{intakes:a,summary:{count:a.length,total_gross:a.reduce((r,o)=>r+(o.gross_weight_kg||0),0),total_net:a.reduce((r,o)=>r+(o.net_weight_kg||0),0),total_finished:a.reduce((r,o)=>r+(o.finished_product_ton||0),0),total_amount:a.reduce((r,o)=>r+(o.total_amount||0),0),supplier_count:c.size}}}};export{E as r};
