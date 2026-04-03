import{s}from"./index-CkN58x1O.js";async function c(r){const{data:a,error:e}=await s.from("payroll_periods").select(`
      *,
      creator:employees!payroll_periods_created_by_fkey(id, full_name),
      confirmer:employees!payroll_periods_confirmed_by_fkey(id, full_name)
    `).eq("id",r).single();if(e)throw e;return a}const h={async getPeriods(r){const{page:a=1,pageSize:e=10,year:t,status:n}=r,l=(a-1)*e,y=l+e-1;let p=s.from("payroll_periods").select(`
        *,
        creator:employees!payroll_periods_created_by_fkey(id, full_name),
        confirmer:employees!payroll_periods_confirmed_by_fkey(id, full_name)
      `,{count:"exact"});t&&(p=p.eq("year",t)),n&&(p=p.eq("status",n));const{data:o,error:d,count:i}=await p.order("year",{ascending:!1}).order("month",{ascending:!1}).range(l,y);if(d)throw d;return{data:o||[],total:i||0,page:a,pageSize:e,totalPages:Math.ceil((i||0)/e)}},getPeriodById:c,async createPeriod(r,a){const{data:e,error:t}=await s.from("payroll_periods").insert({...r,created_by:a}).select().single();if(t)throw t;return e},async updatePeriod(r,a){const{data:e,error:t}=await s.from("payroll_periods").update({...a,updated_at:new Date().toISOString()}).eq("id",r).select().single();if(t)throw t;return e},async confirmPeriod(r,a){const{data:e,error:t}=await s.from("payroll_periods").update({status:"confirmed",confirmed_by:a,confirmed_at:new Date().toISOString()}).eq("id",r).select().single();if(t)throw t;return e},async getPayslips(r){const{page:a=1,pageSize:e=10,period_id:t,employee_id:n,search:l}=r,y=(a-1)*e,p=y+e-1;let o=s.from("payslips").select(`
        *,
        employee:employees!payslips_employee_id_fkey(id, code, full_name),
        payroll_period:payroll_periods!payslips_payroll_period_id_fkey(id, code, name, year, month)
      `,{count:"exact"});t&&(o=o.eq("payroll_period_id",t)),n&&(o=o.eq("employee_id",n)),l&&(o=o.or(`payslip_number.ilike.%${l}%,employee_name.ilike.%${l}%`));const{data:d,error:i,count:_}=await o.order("created_at",{ascending:!1}).range(y,p);if(i)throw i;return{data:d||[],total:_||0,page:a,pageSize:e,totalPages:Math.ceil((_||0)/e)}},async getPayslipById(r){const{data:a,error:e}=await s.from("payslips").select(`
        *,
        employee:employees!payslips_employee_id_fkey(id, code, full_name),
        payroll_period:payroll_periods!payslips_payroll_period_id_fkey(*),
        items:payslip_items(*)
      `).eq("id",r).single();if(e)throw e;return a},async generatePayslips(r){const a=await c(r),{data:e,error:t}=await s.from("employees").select(`
        id, 
        code, 
        full_name,
        department_id,
        position_id,
        salary_grade_id,
        departments!employees_department_id_fkey(id, name),
        positions!employees_position_id_fkey(id, name),
        salary_grades!employees_salary_grade_id_fkey(id, name, base_salary)
      `).eq("status","active");if(t)throw t;const n=e||[];let l=0;for(const o of n){const d=`PL${a.year}-${String(a.month).padStart(2,"0")}-${String(l+1).padStart(3,"0")}`,i=o.salary_grades?.base_salary||0,_=Math.round(i*.08),m=Math.round(i*.015),u=Math.round(i*.01),f=_+m+u,{error:g}=await s.from("payslips").insert({payslip_number:d,payroll_period_id:r,employee_id:o.id,employee_code:o.code,employee_name:o.full_name,department_name:o.departments?.name||null,position_name:o.positions?.name||null,salary_grade_name:o.salary_grades?.name||null,working_days:22,actual_days:22,leave_days:0,unpaid_leave_days:0,overtime_hours:0,base_salary:i,allowances:0,overtime_pay:0,bonus:0,other_income:0,gross_salary:i,social_insurance:_,health_insurance:m,unemployment_insurance:u,personal_income_tax:0,other_deductions:0,total_deductions:f,net_salary:i-f,status:"draft"});g||l++}const{data:y}=await s.from("payslips").select("net_salary").eq("payroll_period_id",r),p=y?.reduce((o,d)=>o+(d.net_salary||0),0)||0;return await s.from("payroll_periods").update({total_employees:l,total_amount:p,status:"processing"}).eq("id",r),l},async generatePayslipNumber(r){const a=await c(r),{data:e,error:t}=await s.from("payslips").select("payslip_number").eq("payroll_period_id",r).order("payslip_number",{ascending:!1}).limit(1);if(!t&&e&&e.length>0){const n=parseInt(e[0].payslip_number.slice(-3))+1;return`PL${a.year}-${String(a.month).padStart(2,"0")}-${String(n).padStart(3,"0")}`}return`PL${a.year}-${String(a.month).padStart(2,"0")}-001`},async deletePayslipsByPeriod(r){const{error:a}=await s.from("payslips").delete().eq("payroll_period_id",r);if(a)throw a;await s.from("payroll_periods").update({total_employees:0,total_amount:0,status:"draft"}).eq("id",r)}};export{h as p};
