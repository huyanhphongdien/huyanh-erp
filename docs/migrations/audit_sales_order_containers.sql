-- ============================================================================
-- AUDIT LOG cho sales_order_containers (chỉnh sửa số cont / seal / lot / xóa)
-- Date: 2026-06-13
-- ============================================================================
-- Ghi mọi thay đổi container vào bảng audit_log (hiện ở trang "Audit Log (BGĐ)").
-- Trigger SECURITY DEFINER để đọc auth.users + employees + ghi audit_log bất kể RLS.
-- An toàn: phần ghi log bọc trong EXCEPTION → nếu log lỗi KHÔNG chặn sửa/xóa container.
-- Idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_sales_order_containers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_chg   jsonb := '{}'::jsonb;
BEGIN
  BEGIN
    IF v_uid IS NOT NULL THEN
      SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
      SELECT full_name INTO v_name FROM public.employees WHERE user_id = v_uid LIMIT 1;
    END IF;

    IF (TG_OP = 'UPDATE') THEN
      IF NEW.container_no  IS DISTINCT FROM OLD.container_no  THEN v_chg := v_chg || jsonb_build_object('container_no',  jsonb_build_object('old', OLD.container_no,  'new', NEW.container_no));  END IF;
      IF NEW.seal_no       IS DISTINCT FROM OLD.seal_no       THEN v_chg := v_chg || jsonb_build_object('seal_no',       jsonb_build_object('old', OLD.seal_no,       'new', NEW.seal_no));       END IF;
      IF NEW.lot_no        IS DISTINCT FROM OLD.lot_no        THEN v_chg := v_chg || jsonb_build_object('lot_no',        jsonb_build_object('old', OLD.lot_no,        'new', NEW.lot_no));        END IF;
      IF NEW.lot_deadline  IS DISTINCT FROM OLD.lot_deadline  THEN v_chg := v_chg || jsonb_build_object('lot_deadline',  jsonb_build_object('old', OLD.lot_deadline,  'new', NEW.lot_deadline));  END IF;
      IF NEW.bale_count    IS DISTINCT FROM OLD.bale_count    THEN v_chg := v_chg || jsonb_build_object('bale_count',    jsonb_build_object('old', OLD.bale_count,    'new', NEW.bale_count));    END IF;
      IF NEW.net_weight_kg IS DISTINCT FROM OLD.net_weight_kg THEN v_chg := v_chg || jsonb_build_object('net_weight_kg', jsonb_build_object('old', OLD.net_weight_kg, 'new', NEW.net_weight_kg)); END IF;
      IF NEW.status        IS DISTINCT FROM OLD.status        THEN v_chg := v_chg || jsonb_build_object('status',        jsonb_build_object('old', OLD.status,        'new', NEW.status));        END IF;

      IF v_chg <> '{}'::jsonb THEN
        INSERT INTO public.audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, changed_fields)
        VALUES ('sales_order_containers', NEW.id, COALESCE(NEW.container_no, OLD.container_no), 'UPDATE', v_uid, v_email, v_name, now(), v_chg);
      END IF;

    ELSIF (TG_OP = 'DELETE') THEN
      INSERT INTO public.audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, old_values)
      VALUES ('sales_order_containers', OLD.id, OLD.container_no, 'DELETE', v_uid, v_email, v_name, now(), to_jsonb(OLD));

    ELSIF (TG_OP = 'INSERT') THEN
      INSERT INTO public.audit_log(table_name, record_id, record_code, action, changed_by_user_id, changed_by_email, changed_by_name, changed_at, new_values)
      VALUES ('sales_order_containers', NEW.id, NEW.container_no, 'INSERT', v_uid, v_email, v_name, now(), to_jsonb(NEW));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log lỗi KHÔNG được chặn nghiệp vụ sửa/xóa container.
    NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_audit_sales_order_containers ON public.sales_order_containers;
CREATE TRIGGER trg_audit_sales_order_containers
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_containers
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_sales_order_containers();

DO $$
BEGIN
  RAISE NOTICE '═══ audit_sales_order_containers VERIFY: trigger created ═══';
END $$;
