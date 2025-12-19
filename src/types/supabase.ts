export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      alert_history: {
        Row: {
          alert_id: string | null
          alert_type: string
          created_at: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: string
          is_dismissed: boolean | null
          is_read: boolean | null
          message: string
          push_sent: boolean | null
          push_sent_at: string | null
          read_at: string | null
          related_entries: string[] | null
          related_orders: number[] | null
          severity: string
          title: string
        }
        Insert: {
          alert_id?: string | null
          alert_type: string
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message: string
          push_sent?: boolean | null
          push_sent_at?: string | null
          read_at?: string | null
          related_entries?: string[] | null
          related_orders?: number[] | null
          severity?: string
          title: string
        }
        Update: {
          alert_id?: string | null
          alert_type?: string
          created_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          is_read?: boolean | null
          message?: string
          push_sent?: boolean | null
          push_sent_at?: string | null
          read_at?: string | null
          related_entries?: string[] | null
          related_orders?: number[] | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_history_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "financial_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          apply_to_existing: boolean | null
          conditions: Json
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          last_triggered_at: string | null
          match_type: string
          name: string
          priority: number | null
          times_triggered: number | null
          trigger_event: string
          updated_at: string | null
        }
        Insert: {
          actions?: Json
          apply_to_existing?: boolean | null
          conditions?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          match_type?: string
          name: string
          priority?: number | null
          times_triggered?: number | null
          trigger_event: string
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          apply_to_existing?: boolean | null
          conditions?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          match_type?: string
          name?: string
          priority?: number | null
          times_triggered?: number | null
          trigger_event?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      available_tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      budget_tracking: {
        Row: {
          actual_amount: number | null
          budget_id: string
          id: string
          period_end: string
          period_start: string
          planned_amount: number
          status: string
          updated_at: string | null
          variance: number | null
          variance_percent: number | null
        }
        Insert: {
          actual_amount?: number | null
          budget_id: string
          id?: string
          period_end: string
          period_start: string
          planned_amount: number
          status?: string
          updated_at?: string | null
          variance?: number | null
          variance_percent?: number | null
        }
        Update: {
          actual_amount?: number | null
          budget_id?: string
          id?: string
          period_end?: string
          period_start?: string
          planned_amount?: number
          status?: string
          updated_at?: string | null
          variance?: number | null
          variance_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_tracking_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "financial_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow_entries: {
        Row: {
          amount: number
          category: string
          category_id: string | null
          competence_date: string | null
          cost_center: string | null
          created_at: string | null
          description: string
          due_date: string
          entity_name: string | null
          entity_type: string | null
          id: string
          installment_number: number | null
          installment_plan_id: string | null
          is_generated: boolean | null
          is_recurring: boolean | null
          notes: string | null
          paid_date: string | null
          parent_entry_id: string | null
          parent_recurring_id: string | null
          recurrence_rule: Json | null
          source: string | null
          source_id: string | null
          status: string | null
          subcategory: string | null
          tags: string[] | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          category: string
          category_id?: string | null
          competence_date?: string | null
          cost_center?: string | null
          created_at?: string | null
          description: string
          due_date: string
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          installment_number?: number | null
          installment_plan_id?: string | null
          is_generated?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          paid_date?: string | null
          parent_entry_id?: string | null
          parent_recurring_id?: string | null
          recurrence_rule?: Json | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          subcategory?: string | null
          tags?: string[] | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string
          category_id?: string | null
          competence_date?: string | null
          cost_center?: string | null
          created_at?: string | null
          description?: string
          due_date?: string
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          installment_number?: number | null
          installment_plan_id?: string | null
          is_generated?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          paid_date?: string | null
          parent_entry_id?: string | null
          parent_recurring_id?: string | null
          recurrence_rule?: Json | null
          source?: string | null
          source_id?: string | null
          status?: string | null
          subcategory?: string | null
          tags?: string[] | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_installment_plan_id_fkey"
            columns: ["installment_plan_id"]
            isOneToOne: false
            referencedRelation: "installment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_parent_entry_id_fkey"
            columns: ["parent_entry_id"]
            isOneToOne: false
            referencedRelation: "cash_flow_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_entries_parent_recurring_id_fkey"
            columns: ["parent_recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      compras_drafts: {
        Row: {
          created_at: string
          current_order_name: string
          draft_key: string
          manual_items: Json
          pedido_overrides: Json
          period_days: number | null
          selected_ids: Json
          target_days: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_order_name?: string
          draft_key?: string
          manual_items?: Json
          pedido_overrides?: Json
          period_days?: number | null
          selected_ids?: Json
          target_days?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_order_name?: string
          draft_key?: string
          manual_items?: Json
          pedido_overrides?: Json
          period_days?: number | null
          selected_ids?: Json
          target_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      compras_saved_orders: {
        Row: {
          created_at: string
          id: string
          item_count: number | null
          manual_items: Json
          name: string
          period_days: number
          produtos: Json
          target_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_count?: number | null
          manual_items?: Json
          name: string
          period_days?: number
          produtos?: Json
          target_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_count?: number | null
          manual_items?: Json
          name?: string
          period_days?: number
          produtos?: Json
          target_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          budget_monthly: number | null
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          budget_monthly?: number | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          budget_monthly?: number | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      dashboard_resumo_cache: {
        Row: {
          built_at: string
          canais_key: string
          expires_at: string | null
          id: number
          last_refreshed_at: string
          order_facts: Json
          payload: Json
          periodo_fim: string
          periodo_inicio: string
          produto_facts: Json
          situacoes_key: string
          source_max_updated_at: string | null
          total_frete_total: number
          total_pedidos: number
          total_produtos_vendidos: number
          total_valor: number
          total_valor_liquido: number
        }
        Insert: {
          built_at?: string
          canais_key?: string
          expires_at?: string | null
          id?: number
          last_refreshed_at?: string
          order_facts?: Json
          payload?: Json
          periodo_fim: string
          periodo_inicio: string
          produto_facts?: Json
          situacoes_key?: string
          source_max_updated_at?: string | null
          total_frete_total?: number
          total_pedidos?: number
          total_produtos_vendidos?: number
          total_valor?: number
          total_valor_liquido?: number
        }
        Update: {
          built_at?: string
          canais_key?: string
          expires_at?: string | null
          id?: number
          last_refreshed_at?: string
          order_facts?: Json
          payload?: Json
          periodo_fim?: string
          periodo_inicio?: string
          produto_facts?: Json
          situacoes_key?: string
          source_max_updated_at?: string | null
          total_frete_total?: number
          total_pedidos?: number
          total_produtos_vendidos?: number
          total_valor?: number
          total_valor_liquido?: number
        }
        Relationships: []
      }
      dre_categories: {
        Row: {
          channel: string | null
          code: string
          created_at: string
          group_type: string
          id: string
          is_default: boolean
          is_editable: boolean
          name: string
          order_index: number
          parent_code: string | null
          sign: string
          updated_at: string
        }
        Insert: {
          channel?: string | null
          code: string
          created_at?: string
          group_type: string
          id?: string
          is_default?: boolean
          is_editable?: boolean
          name: string
          order_index?: number
          parent_code?: string | null
          sign: string
          updated_at?: string
        }
        Update: {
          channel?: string | null
          code?: string
          created_at?: string
          group_type?: string
          id?: string
          is_default?: boolean
          is_editable?: boolean
          name?: string
          order_index?: number
          parent_code?: string | null
          sign?: string
          updated_at?: string
        }
        Relationships: []
      }
      dre_periods: {
        Row: {
          created_at: string
          id: string
          label: string
          month: number
          reserve_percent: number | null
          status: string
          target_net_margin: number | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          month: number
          reserve_percent?: number | null
          status?: string
          target_net_margin?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          month?: number
          reserve_percent?: number | null
          status?: string
          target_net_margin?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      dre_values: {
        Row: {
          amount_auto: number | null
          amount_manual: number | null
          auto_source: string | null
          category_id: string
          created_at: string
          final_amount: number | null
          id: string
          notes: string | null
          period_id: string
          updated_at: string
        }
        Insert: {
          amount_auto?: number | null
          amount_manual?: number | null
          auto_source?: string | null
          category_id: string
          created_at?: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          period_id: string
          updated_at?: string
        }
        Update: {
          amount_auto?: number | null
          amount_manual?: number | null
          auto_source?: string | null
          category_id?: string
          created_at?: string
          final_amount?: number | null
          id?: string
          notes?: string | null
          period_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dre_values_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "dre_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dre_values_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "dre_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      embalagens: {
        Row: {
          altura: number
          codigo: string
          comprimento: number
          created_at: string
          descricao: string | null
          estoque_atual: number
          id: string
          largura: number
          nome: string
          preco_unitario: number
          updated_at: string
        }
        Insert: {
          altura: number
          codigo: string
          comprimento: number
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          id?: string
          largura: number
          nome: string
          preco_unitario?: number
          updated_at?: string
        }
        Update: {
          altura?: number
          codigo?: string
          comprimento?: number
          created_at?: string
          descricao?: string | null
          estoque_atual?: number
          id?: string
          largura?: number
          nome?: string
          preco_unitario?: number
          updated_at?: string
        }
        Relationships: []
      }
      financial_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          days_before: number | null
          email_address: string | null
          id: string
          is_enabled: boolean | null
          last_triggered_at: string | null
          notify_email: boolean | null
          notify_push: boolean | null
          schedule_day: number | null
          schedule_time: string | null
          threshold_value: number | null
          updated_at: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          days_before?: number | null
          email_address?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          notify_email?: boolean | null
          notify_push?: boolean | null
          schedule_day?: number | null
          schedule_time?: string | null
          threshold_value?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          days_before?: number | null
          email_address?: string | null
          id?: string
          is_enabled?: boolean | null
          last_triggered_at?: string | null
          notify_email?: boolean | null
          notify_push?: boolean | null
          schedule_day?: number | null
          schedule_time?: string | null
          threshold_value?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_budgets: {
        Row: {
          alert_threshold: number | null
          budget_type: string
          created_at: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          name: string
          period_type: string
          planned_amount: number
          start_date: string
          target_value: string | null
          updated_at: string | null
        }
        Insert: {
          alert_threshold?: number | null
          budget_type: string
          created_at?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          name: string
          period_type: string
          planned_amount: number
          start_date: string
          target_value?: string | null
          updated_at?: string | null
        }
        Update: {
          alert_threshold?: number | null
          budget_type?: string
          created_at?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          name?: string
          period_type?: string
          planned_amount?: number
          start_date?: string
          target_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      financial_categories: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          is_system: boolean | null
          name: string
          parent_id: string | null
          sort_order: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name: string
          parent_id?: string | null
          sort_order?: number | null
          type: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          name?: string
          parent_id?: string | null
          sort_order?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_plans: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string | null
          description: string
          entity_name: string | null
          entity_type: string | null
          first_due_date: string
          frequency: string
          id: string
          installment_amount: number
          paid_installments: number | null
          status: string
          total_amount: number
          total_installments: number
          type: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          description: string
          entity_name?: string | null
          entity_type?: string | null
          first_due_date: string
          frequency?: string
          id?: string
          installment_amount: number
          paid_installments?: number | null
          status?: string
          total_amount: number
          total_installments: number
          type: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          description?: string
          entity_name?: string | null
          entity_type?: string | null
          first_due_date?: string
          frequency?: string
          id?: string
          installment_amount?: number
          paid_installments?: number | null
          status?: string
          total_amount?: number
          total_installments?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_plans_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      magalu_order_items: {
        Row: {
          created_at: string | null
          discount: number | null
          freight: number | null
          id: number
          id_order: string
          id_order_package: number
          id_sku: string | null
          price: number | null
          product_name: string | null
          quantity: number | null
          raw_payload: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          freight?: number | null
          id?: number
          id_order: string
          id_order_package?: number
          id_sku?: string | null
          price?: number | null
          product_name?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          freight?: number | null
          id?: number
          id_order?: string
          id_order_package?: number
          id_sku?: string | null
          price?: number | null
          product_name?: string | null
          quantity?: number | null
          raw_payload?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      magalu_orders: {
        Row: {
          approved_date: string | null
          created_at: string | null
          customer_mail: string | null
          delivery_address_city: string | null
          delivery_address_full: string | null
          delivery_address_state: string | null
          delivery_mode: string | null
          estimated_delivery_date: string | null
          handling_time_limit: string | null
          id: number
          id_order: string
          id_order_marketplace: string | null
          inserted_date: string | null
          marketplace_name: string | null
          order_status: string | null
          purchased_date: string | null
          raw_payload: Json | null
          receiver_name: string | null
          store_name: string | null
          synced_at: string | null
          tenant_id: string | null
          total_amount: number | null
          total_discount: number | null
          total_freight: number | null
          updated_at: string | null
          updated_date: string | null
        }
        Insert: {
          approved_date?: string | null
          created_at?: string | null
          customer_mail?: string | null
          delivery_address_city?: string | null
          delivery_address_full?: string | null
          delivery_address_state?: string | null
          delivery_mode?: string | null
          estimated_delivery_date?: string | null
          handling_time_limit?: string | null
          id?: number
          id_order: string
          id_order_marketplace?: string | null
          inserted_date?: string | null
          marketplace_name?: string | null
          order_status?: string | null
          purchased_date?: string | null
          raw_payload?: Json | null
          receiver_name?: string | null
          store_name?: string | null
          synced_at?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          total_discount?: number | null
          total_freight?: number | null
          updated_at?: string | null
          updated_date?: string | null
        }
        Update: {
          approved_date?: string | null
          created_at?: string | null
          customer_mail?: string | null
          delivery_address_city?: string | null
          delivery_address_full?: string | null
          delivery_address_state?: string | null
          delivery_mode?: string | null
          estimated_delivery_date?: string | null
          handling_time_limit?: string | null
          id?: number
          id_order?: string
          id_order_marketplace?: string | null
          inserted_date?: string | null
          marketplace_name?: string | null
          order_status?: string | null
          purchased_date?: string | null
          raw_payload?: Json | null
          receiver_name?: string | null
          store_name?: string | null
          synced_at?: string | null
          tenant_id?: string | null
          total_amount?: number | null
          total_discount?: number | null
          total_freight?: number | null
          updated_at?: string | null
          updated_date?: string | null
        }
        Relationships: []
      }
      magalu_sync_cursor: {
        Row: {
          error_message: string | null
          id: number
          last_sync_at: string | null
          sync_status: string | null
          total_orders_synced: number | null
          updated_at: string | null
        }
        Insert: {
          error_message?: string | null
          id?: number
          last_sync_at?: string | null
          sync_status?: string | null
          total_orders_synced?: number | null
          updated_at?: string | null
        }
        Update: {
          error_message?: string | null
          id?: number
          last_sync_at?: string | null
          sync_status?: string | null
          total_orders_synced?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      magalu_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string | null
          expires_in: number | null
          id: number
          refresh_token: string
          scope: string | null
          tenant_id: string | null
          token_type: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at?: string | null
          expires_in?: number | null
          id?: number
          refresh_token: string
          scope?: string | null
          tenant_id?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string | null
          expires_in?: number | null
          id?: number
          refresh_token?: string
          scope?: string | null
          tenant_id?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_fee_config: {
        Row: {
          campaigns: Json | null
          config: Json
          created_at: string | null
          id: number
          marketplace: string
          updated_at: string | null
        }
        Insert: {
          campaigns?: Json | null
          config?: Json
          created_at?: string | null
          id?: number
          marketplace: string
          updated_at?: string | null
        }
        Update: {
          campaigns?: Json | null
          config?: Json
          created_at?: string | null
          id?: number
          marketplace?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      marketplace_kit_components: {
        Row: {
          component_qty: number
          component_sku: string
          created_at: string
          id: number
          marketplace: string
          marketplace_sku: string
          updated_at: string
        }
        Insert: {
          component_qty?: number
          component_sku: string
          created_at?: string
          id?: number
          marketplace: string
          marketplace_sku: string
          updated_at?: string
        }
        Update: {
          component_qty?: number
          component_sku?: string
          created_at?: string
          id?: number
          marketplace?: string
          marketplace_sku?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_order_links: {
        Row: {
          calculated_fees: Json | null
          confidence_score: number | null
          id: number
          is_campaign_order: boolean | null
          is_kit: boolean | null
          linked_at: string
          linked_by: string | null
          marketplace: string
          marketplace_order_id: string
          notes: string | null
          product_count: number | null
          tiny_order_id: number
          uses_free_shipping: boolean | null
        }
        Insert: {
          calculated_fees?: Json | null
          confidence_score?: number | null
          id?: number
          is_campaign_order?: boolean | null
          is_kit?: boolean | null
          linked_at?: string
          linked_by?: string | null
          marketplace: string
          marketplace_order_id: string
          notes?: string | null
          product_count?: number | null
          tiny_order_id: number
          uses_free_shipping?: boolean | null
        }
        Update: {
          calculated_fees?: Json | null
          confidence_score?: number | null
          id?: number
          is_campaign_order?: boolean | null
          is_kit?: boolean | null
          linked_at?: string
          linked_by?: string | null
          marketplace?: string
          marketplace_order_id?: string
          notes?: string | null
          product_count?: number | null
          tiny_order_id?: number
          uses_free_shipping?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_order_links_tiny_order_id_fkey"
            columns: ["tiny_order_id"]
            isOneToOne: false
            referencedRelation: "tiny_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_payments: {
        Row: {
          balance_after: number | null
          created_at: string | null
          discount: number | null
          expense_category: string | null
          fees: number | null
          gross_amount: number | null
          id: string
          is_adjustment: boolean | null
          is_expense: boolean | null
          is_refund: boolean | null
          marketplace: string
          marketplace_order_id: string
          match_confidence: string | null
          matched_at: string | null
          net_amount: number | null
          parent_payment_id: string | null
          payment_date: string | null
          payment_method: string | null
          raw_data: Json | null
          settlement_date: string | null
          status: string | null
          tags: string[] | null
          tiny_order_id: number | null
          transaction_description: string | null
          transaction_type: string | null
          updated_at: string | null
          upload_batch_id: string
        }
        Insert: {
          balance_after?: number | null
          created_at?: string | null
          discount?: number | null
          expense_category?: string | null
          fees?: number | null
          gross_amount?: number | null
          id?: string
          is_adjustment?: boolean | null
          is_expense?: boolean | null
          is_refund?: boolean | null
          marketplace: string
          marketplace_order_id: string
          match_confidence?: string | null
          matched_at?: string | null
          net_amount?: number | null
          parent_payment_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          raw_data?: Json | null
          settlement_date?: string | null
          status?: string | null
          tags?: string[] | null
          tiny_order_id?: number | null
          transaction_description?: string | null
          transaction_type?: string | null
          updated_at?: string | null
          upload_batch_id: string
        }
        Update: {
          balance_after?: number | null
          created_at?: string | null
          discount?: number | null
          expense_category?: string | null
          fees?: number | null
          gross_amount?: number | null
          id?: string
          is_adjustment?: boolean | null
          is_expense?: boolean | null
          is_refund?: boolean | null
          marketplace?: string
          marketplace_order_id?: string
          match_confidence?: string | null
          matched_at?: string | null
          net_amount?: number | null
          parent_payment_id?: string | null
          payment_date?: string | null
          payment_method?: string | null
          raw_data?: Json | null
          settlement_date?: string | null
          status?: string | null
          tags?: string[] | null
          tiny_order_id?: number | null
          transaction_description?: string | null
          transaction_type?: string | null
          updated_at?: string | null
          upload_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "marketplace_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_payments_tiny_order_id_fkey"
            columns: ["tiny_order_id"]
            isOneToOne: false
            referencedRelation: "tiny_orders"
            referencedColumns: ["tiny_id"]
          },
          {
            foreignKeyName: "marketplace_payments_upload_batch_id_fkey"
            columns: ["upload_batch_id"]
            isOneToOne: false
            referencedRelation: "payment_upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_sku_mapping: {
        Row: {
          created_at: string
          created_by: string | null
          id: number
          mapping_type: string
          marketplace: string
          marketplace_product_name: string | null
          marketplace_sku: string
          notes: string | null
          tiny_product_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: number
          mapping_type?: string
          marketplace: string
          marketplace_product_name?: string | null
          marketplace_sku: string
          notes?: string | null
          tiny_product_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: number
          mapping_type?: string
          marketplace?: string
          marketplace_product_name?: string | null
          marketplace_sku?: string
          notes?: string | null
          tiny_product_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["tiny_id"]
          },
        ]
      }
      meli_order_items: {
        Row: {
          category_id: string | null
          created_at: string
          currency_id: string
          id: number
          item_id: string
          item_thumbnail_url: string | null
          meli_order_id: number
          quantity: number
          raw_payload: Json
          sku: string | null
          title: string
          unit_price: number
          updated_at: string
          variation_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          currency_id: string
          id?: number
          item_id: string
          item_thumbnail_url?: string | null
          meli_order_id: number
          quantity: number
          raw_payload: Json
          sku?: string | null
          title: string
          unit_price: number
          updated_at?: string
          variation_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          currency_id?: string
          id?: number
          item_id?: string
          item_thumbnail_url?: string | null
          meli_order_id?: number
          quantity?: number
          raw_payload?: Json
          sku?: string | null
          title?: string
          unit_price?: number
          updated_at?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meli_order_items_meli_order_id_fkey"
            columns: ["meli_order_id"]
            isOneToOne: false
            referencedRelation: "meli_orders"
            referencedColumns: ["meli_order_id"]
          },
        ]
      }
      meli_orders: {
        Row: {
          buyer_email: string | null
          buyer_full_name: string | null
          buyer_id: number | null
          buyer_nickname: string | null
          created_at: string
          currency_id: string
          date_created: string
          last_updated: string
          meli_order_id: number
          raw_payload: Json
          seller_id: number
          shipping_city: string | null
          shipping_cost: number | null
          shipping_state: string | null
          status: string
          tags: string[] | null
          total_amount: number
          total_amount_with_shipping: number | null
          updated_at: string
        }
        Insert: {
          buyer_email?: string | null
          buyer_full_name?: string | null
          buyer_id?: number | null
          buyer_nickname?: string | null
          created_at?: string
          currency_id: string
          date_created: string
          last_updated: string
          meli_order_id: number
          raw_payload: Json
          seller_id: number
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_state?: string | null
          status: string
          tags?: string[] | null
          total_amount: number
          total_amount_with_shipping?: number | null
          updated_at?: string
        }
        Update: {
          buyer_email?: string | null
          buyer_full_name?: string | null
          buyer_id?: number | null
          buyer_nickname?: string | null
          created_at?: string
          currency_id?: string
          date_created?: string
          last_updated?: string
          meli_order_id?: number
          raw_payload?: Json
          seller_id?: number
          shipping_city?: string | null
          shipping_cost?: number | null
          shipping_state?: string | null
          status?: string
          tags?: string[] | null
          total_amount?: number
          total_amount_with_shipping?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      meli_tokens: {
        Row: {
          access_token: string
          expires_at: string | null
          id: number
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          expires_at?: string | null
          id?: number
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          expires_at?: string | null
          id?: number
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_tags: {
        Row: {
          created_at: string | null
          id: string
          order_id: number
          tag_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: number
          tag_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: number
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_tags_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "tiny_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_auto_link_rules: {
        Row: {
          action: string
          created_at: string | null
          id: string
          marketplace: string
          priority: number | null
          tags: string[] | null
          transaction_type_pattern: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          marketplace: string
          priority?: number | null
          tags?: string[] | null
          transaction_type_pattern: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          marketplace?: string
          priority?: number | null
          tags?: string[] | null
          transaction_type_pattern?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_import_sessions: {
        Row: {
          batch_id: string | null
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          id: string
          marketplace: string
          parsed_data: Json | null
          status: string
          updated_at: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          marketplace: string
          parsed_data?: Json | null
          status: string
          updated_at?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          id?: string
          marketplace?: string
          parsed_data?: Json | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_import_sessions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "payment_upload_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transaction_groups: {
        Row: {
          created_at: string | null
          has_adjustments: boolean | null
          has_refunds: boolean | null
          id: string
          marketplace: string
          marketplace_order_id: string
          net_balance: number
          tags: string[] | null
          transaction_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          has_adjustments?: boolean | null
          has_refunds?: boolean | null
          id?: string
          marketplace: string
          marketplace_order_id: string
          net_balance?: number
          tags?: string[] | null
          transaction_count?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          has_adjustments?: boolean | null
          has_refunds?: boolean | null
          id?: string
          marketplace?: string
          marketplace_order_id?: string
          net_balance?: number
          tags?: string[] | null
          transaction_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_upload_batches: {
        Row: {
          created_at: string | null
          date_range_end: string | null
          date_range_start: string | null
          error_message: string | null
          filename: string
          id: string
          marketplace: string
          payments_count: number | null
          rows_failed: number | null
          rows_matched: number | null
          rows_processed: number | null
          rows_skipped: number | null
          status: string | null
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          filename: string
          id?: string
          marketplace: string
          payments_count?: number | null
          rows_failed?: number | null
          rows_matched?: number | null
          rows_processed?: number | null
          rows_skipped?: number | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          error_message?: string | null
          filename?: string
          id?: string
          marketplace?: string
          payments_count?: number | null
          rows_failed?: number | null
          rows_matched?: number | null
          rows_processed?: number | null
          rows_skipped?: number | null
          status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      produto_embalagens: {
        Row: {
          created_at: string
          embalagem_id: string
          id: string
          produto_id: number
          quantidade: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          embalagem_id: string
          id?: string
          produto_id: number
          quantidade?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          embalagem_id?: string
          id?: string
          produto_id?: number
          quantidade?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_produto_embalagens_embalagem"
            columns: ["embalagem_id"]
            isOneToOne: false
            referencedRelation: "embalagens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_produto_embalagens_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_produto_embalagens_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_sync_cursor: {
        Row: {
          cursor_key: string
          latest_data_alteracao: string | null
          updated_at: string
          updated_since: string | null
        }
        Insert: {
          cursor_key: string
          latest_data_alteracao?: string | null
          updated_at?: string
          updated_since?: string | null
        }
        Update: {
          cursor_key?: string
          latest_data_alteracao?: string | null
          updated_at?: string
          updated_since?: string | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: number | null
          product_name: string
          product_sku: string | null
          purchase_order_id: string
          quantity: number
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: number | null
          product_name: string
          product_sku?: string | null
          purchase_order_id: string
          quantity?: number
          total_cost?: number | null
          unit_cost?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: number | null
          product_name?: string
          product_sku?: string | null
          purchase_order_id?: string
          quantity?: number
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          expected_payment_date: string | null
          external_id: string | null
          id: string
          issue_date: string
          notes: string | null
          payment_method: string | null
          status: string | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expected_payment_date?: string | null
          external_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          payment_method?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expected_payment_date?: string | null
          external_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          payment_method?: string | null
          status?: string | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      recurring_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          day_of_month: number | null
          day_of_week: number | null
          description: string
          entity_name: string | null
          frequency: string
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          next_due_date: string | null
          notes: string | null
          subcategory: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description: string
          entity_name?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_due_date?: string | null
          notes?: string | null
          subcategory?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string
          entity_name?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_due_date?: string | null
          notes?: string | null
          subcategory?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      shopee_order_items: {
        Row: {
          created_at: string
          discounted_price: number | null
          id: number
          is_wholesale: boolean | null
          item_id: number
          item_name: string
          item_sku: string | null
          model_id: number
          model_name: string | null
          model_sku: string | null
          order_sn: string
          original_price: number | null
          quantity: number
          raw_payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          discounted_price?: number | null
          id?: number
          is_wholesale?: boolean | null
          item_id: number
          item_name: string
          item_sku?: string | null
          model_id?: number
          model_name?: string | null
          model_sku?: string | null
          order_sn: string
          original_price?: number | null
          quantity?: number
          raw_payload: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          discounted_price?: number | null
          id?: number
          is_wholesale?: boolean | null
          item_id?: number
          item_name?: string
          item_sku?: string | null
          model_id?: number
          model_name?: string | null
          model_sku?: string | null
          order_sn?: string
          original_price?: number | null
          quantity?: number
          raw_payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopee_order_items_order_sn_fkey"
            columns: ["order_sn"]
            isOneToOne: false
            referencedRelation: "shopee_orders"
            referencedColumns: ["order_sn"]
          },
        ]
      }
      shopee_orders: {
        Row: {
          buyer_user_id: number | null
          buyer_username: string | null
          cod: boolean | null
          create_time: string
          created_at: string
          currency: string
          order_sn: string
          order_status: string
          raw_payload: Json
          recipient_city: string | null
          recipient_full_address: string | null
          recipient_name: string | null
          recipient_phone: string | null
          recipient_state: string | null
          shipping_carrier: string | null
          shop_id: number
          tags: string[] | null
          total_amount: number
          update_time: string
          updated_at: string
        }
        Insert: {
          buyer_user_id?: number | null
          buyer_username?: string | null
          cod?: boolean | null
          create_time: string
          created_at?: string
          currency?: string
          order_sn: string
          order_status: string
          raw_payload: Json
          recipient_city?: string | null
          recipient_full_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_state?: string | null
          shipping_carrier?: string | null
          shop_id: number
          tags?: string[] | null
          total_amount: number
          update_time: string
          updated_at?: string
        }
        Update: {
          buyer_user_id?: number | null
          buyer_username?: string | null
          cod?: boolean | null
          create_time?: string
          created_at?: string
          currency?: string
          order_sn?: string
          order_status?: string
          raw_payload?: Json
          recipient_city?: string | null
          recipient_full_address?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          recipient_state?: string | null
          shipping_carrier?: string | null
          shop_id?: number
          tags?: string[] | null
          total_amount?: number
          update_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      shopee_sync_cursor: {
        Row: {
          created_at: string
          error_message: string | null
          id: number
          last_order_update_time: string | null
          last_sync_at: string | null
          sync_status: string | null
          total_orders_synced: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: number
          last_order_update_time?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          total_orders_synced?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: number
          last_order_update_time?: string | null
          last_sync_at?: string | null
          sync_status?: string | null
          total_orders_synced?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      shopee_tokens: {
        Row: {
          access_token: string
          expires_at: string | null
          id: number
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          expires_at?: string | null
          id?: number
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          expires_at?: string | null
          id?: number
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      sync_jobs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          params: Json | null
          started_at: string
          status: string
          total_orders: number | null
          total_requests: number | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          params?: Json | null
          started_at?: string
          status: string
          total_orders?: number | null
          total_requests?: number | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          params?: Json | null
          started_at?: string
          status?: string
          total_orders?: number | null
          total_requests?: number | null
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          id: number
          job_id: string | null
          level: string
          message: string
          meta: Json | null
        }
        Insert: {
          created_at?: string
          id?: number
          job_id?: string | null
          level: string
          message: string
          meta?: Json | null
        }
        Update: {
          created_at?: string
          id?: number
          job_id?: string | null
          level?: string
          message?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_settings: {
        Row: {
          auto_sync_enabled: boolean
          auto_sync_window_days: number
          created_at: string | null
          cron_dias_recent_orders: number | null
          cron_enrich_enabled: boolean | null
          cron_produtos_enabled: boolean | null
          cron_produtos_enrich_estoque: boolean | null
          cron_produtos_limit: number | null
          id: number
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          auto_sync_enabled?: boolean
          auto_sync_window_days?: number
          created_at?: string | null
          cron_dias_recent_orders?: number | null
          cron_enrich_enabled?: boolean | null
          cron_produtos_enabled?: boolean | null
          cron_produtos_enrich_estoque?: boolean | null
          cron_produtos_limit?: number | null
          id?: number
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          auto_sync_enabled?: boolean
          auto_sync_window_days?: number
          created_at?: string | null
          cron_dias_recent_orders?: number | null
          cron_enrich_enabled?: boolean | null
          cron_produtos_enabled?: boolean | null
          cron_produtos_enrich_estoque?: boolean | null
          cron_produtos_limit?: number | null
          id?: number
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tiny_api_usage: {
        Row: {
          context: string
          created_at: string
          endpoint: string
          error_code: string | null
          error_message: string | null
          id: number
          method: string
          status_code: number | null
          success: boolean | null
        }
        Insert: {
          context: string
          created_at?: string
          endpoint: string
          error_code?: string | null
          error_message?: string | null
          id?: number
          method?: string
          status_code?: number | null
          success?: boolean | null
        }
        Update: {
          context?: string
          created_at?: string
          endpoint?: string
          error_code?: string | null
          error_message?: string | null
          id?: number
          method?: string
          status_code?: number | null
          success?: boolean | null
        }
        Relationships: []
      }
      tiny_orders: {
        Row: {
          canal: string | null
          cidade: string | null
          cidade_lat: number | null
          cidade_lon: number | null
          cliente_nome: string | null
          data_criacao: string | null
          data_hash: string | null
          diferenca_valor: number | null
          fee_overrides: Json | null
          fees_breakdown: Json | null
          forma_pagamento: string | null
          id: number
          inserted_at: string | null
          is_enriched: boolean | null
          last_sync_check: string | null
          marketplace_payment_id: string | null
          numero_pedido: number | null
          numero_pedido_ecommerce: string | null
          payment_received: boolean | null
          payment_received_at: string | null
          raw: Json | null
          raw_payload: Json | null
          situacao: number | null
          tiny_data_atualizacao: string | null
          tiny_data_faturamento: string | null
          tiny_data_prevista: string | null
          tiny_id: number
          transportador_nome: string | null
          uf: string | null
          updated_at: string | null
          valor: number | null
          valor_desconto: number | null
          valor_esperado_liquido: number | null
          valor_frete: number | null
          valor_outras_despesas: number | null
          valor_total_pedido: number | null
          valor_total_produtos: number | null
        }
        Insert: {
          canal?: string | null
          cidade?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cliente_nome?: string | null
          data_criacao?: string | null
          data_hash?: string | null
          diferenca_valor?: number | null
          fee_overrides?: Json | null
          fees_breakdown?: Json | null
          forma_pagamento?: string | null
          id?: number
          inserted_at?: string | null
          is_enriched?: boolean | null
          last_sync_check?: string | null
          marketplace_payment_id?: string | null
          numero_pedido?: number | null
          numero_pedido_ecommerce?: string | null
          payment_received?: boolean | null
          payment_received_at?: string | null
          raw?: Json | null
          raw_payload?: Json | null
          situacao?: number | null
          tiny_data_atualizacao?: string | null
          tiny_data_faturamento?: string | null
          tiny_data_prevista?: string | null
          tiny_id: number
          transportador_nome?: string | null
          uf?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_desconto?: number | null
          valor_esperado_liquido?: number | null
          valor_frete?: number | null
          valor_outras_despesas?: number | null
          valor_total_pedido?: number | null
          valor_total_produtos?: number | null
        }
        Update: {
          canal?: string | null
          cidade?: string | null
          cidade_lat?: number | null
          cidade_lon?: number | null
          cliente_nome?: string | null
          data_criacao?: string | null
          data_hash?: string | null
          diferenca_valor?: number | null
          fee_overrides?: Json | null
          fees_breakdown?: Json | null
          forma_pagamento?: string | null
          id?: number
          inserted_at?: string | null
          is_enriched?: boolean | null
          last_sync_check?: string | null
          marketplace_payment_id?: string | null
          numero_pedido?: number | null
          numero_pedido_ecommerce?: string | null
          payment_received?: boolean | null
          payment_received_at?: string | null
          raw?: Json | null
          raw_payload?: Json | null
          situacao?: number | null
          tiny_data_atualizacao?: string | null
          tiny_data_faturamento?: string | null
          tiny_data_prevista?: string | null
          tiny_id?: number
          transportador_nome?: string | null
          uf?: string | null
          updated_at?: string | null
          valor?: number | null
          valor_desconto?: number | null
          valor_esperado_liquido?: number | null
          valor_frete?: number | null
          valor_outras_despesas?: number | null
          valor_total_pedido?: number | null
          valor_total_produtos?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tiny_orders_marketplace_payment_id_fkey"
            columns: ["marketplace_payment_id"]
            isOneToOne: false
            referencedRelation: "marketplace_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      tiny_pedido_itens: {
        Row: {
          codigo_produto: string
          created_at: string | null
          id: number
          id_pedido: number
          id_produto_tiny: number | null
          info_adicional: string | null
          nome_produto: string
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          codigo_produto?: string
          created_at?: string | null
          id?: number
          id_pedido: number
          id_produto_tiny?: number | null
          info_adicional?: string | null
          nome_produto: string
          quantidade: number
          valor_total: number
          valor_unitario: number
        }
        Update: {
          codigo_produto?: string
          created_at?: string | null
          id?: number
          id_pedido?: number
          id_produto_tiny?: number | null
          info_adicional?: string | null
          nome_produto?: string
          quantidade?: number
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_produto"
            columns: ["id_produto_tiny"]
            isOneToOne: false
            referencedRelation: "tiny_produtos"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "fk_produto"
            columns: ["id_produto_tiny"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "fk_produto"
            columns: ["id_produto_tiny"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["tiny_id"]
          },
          {
            foreignKeyName: "tiny_pedido_itens_id_pedido_fkey"
            columns: ["id_pedido"]
            isOneToOne: false
            referencedRelation: "tiny_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      tiny_produtos: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string | null
          data_atualizacao_tiny: string | null
          data_criacao_tiny: string | null
          descricao: string | null
          disponivel: number | null
          embalagem_qtd: number | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          gtin: string | null
          id: number
          id_produto_tiny: number
          imagem_url: string | null
          marca: string | null
          ncm: string | null
          nome: string
          observacao_compras: string | null
          origem: string | null
          peso_bruto: number | null
          peso_liquido: number | null
          preco: number | null
          preco_promocional: number | null
          raw_payload: Json | null
          reservado: number | null
          saldo: number | null
          situacao: string | null
          tipo: string | null
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          data_atualizacao_tiny?: string | null
          data_criacao_tiny?: string | null
          descricao?: string | null
          disponivel?: number | null
          embalagem_qtd?: number | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          gtin?: string | null
          id?: number
          id_produto_tiny: number
          imagem_url?: string | null
          marca?: string | null
          ncm?: string | null
          nome: string
          observacao_compras?: string | null
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_promocional?: number | null
          raw_payload?: Json | null
          reservado?: number | null
          saldo?: number | null
          situacao?: string | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          data_atualizacao_tiny?: string | null
          data_criacao_tiny?: string | null
          descricao?: string | null
          disponivel?: number | null
          embalagem_qtd?: number | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          gtin?: string | null
          id?: number
          id_produto_tiny?: number
          imagem_url?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string
          observacao_compras?: string | null
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_promocional?: number | null
          raw_payload?: Json | null
          reservado?: number | null
          saldo?: number | null
          situacao?: string | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tiny_tokens: {
        Row: {
          access_token: string | null
          created_at: string | null
          expires_at: number | null
          id: number
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: number | null
          id?: number
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: number | null
          id?: number
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_fluxo_preferences: {
        Row: {
          created_at: string | null
          default_filters: Json | null
          export_format: string | null
          id: string
          notification_cooldown_hours: number | null
          rows_per_page: number | null
          show_categories: boolean | null
          show_cost_centers: boolean | null
          show_entities: boolean | null
          updated_at: string | null
          user_id: string | null
          visible_columns: Json | null
        }
        Insert: {
          created_at?: string | null
          default_filters?: Json | null
          export_format?: string | null
          id?: string
          notification_cooldown_hours?: number | null
          rows_per_page?: number | null
          show_categories?: boolean | null
          show_cost_centers?: boolean | null
          show_entities?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          visible_columns?: Json | null
        }
        Update: {
          created_at?: string | null
          default_filters?: Json | null
          export_format?: string | null
          id?: string
          notification_cooldown_hours?: number | null
          rows_per_page?: number | null
          show_categories?: boolean | null
          show_cost_centers?: boolean | null
          show_entities?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          visible_columns?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      tiny_produtos_v: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string | null
          data_atualizacao_tiny: string | null
          data_criacao_tiny: string | null
          descricao: string | null
          disponivel: number | null
          embalagem_qtd: number | null
          fornecedor_codigo: string | null
          fornecedor_nome: string | null
          gtin: string | null
          id: number | null
          id_produto_tiny: number | null
          imagem_url: string | null
          marca: string | null
          ncm: string | null
          nome: string | null
          observacao_compras: string | null
          origem: string | null
          peso_bruto: number | null
          peso_liquido: number | null
          preco: number | null
          preco_promocional: number | null
          raw_payload: Json | null
          reservado: number | null
          saldo: number | null
          situacao: string | null
          tiny_id: number | null
          tipo: string | null
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          data_atualizacao_tiny?: string | null
          data_criacao_tiny?: string | null
          descricao?: string | null
          disponivel?: number | null
          embalagem_qtd?: number | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          gtin?: string | null
          id?: number | null
          id_produto_tiny?: number | null
          imagem_url?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          observacao_compras?: string | null
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_promocional?: number | null
          raw_payload?: Json | null
          reservado?: number | null
          saldo?: number | null
          situacao?: string | null
          tiny_id?: number | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string | null
          data_atualizacao_tiny?: string | null
          data_criacao_tiny?: string | null
          descricao?: string | null
          disponivel?: number | null
          embalagem_qtd?: number | null
          fornecedor_codigo?: string | null
          fornecedor_nome?: string | null
          gtin?: string | null
          id?: number | null
          id_produto_tiny?: number | null
          imagem_url?: string | null
          marca?: string | null
          ncm?: string | null
          nome?: string | null
          observacao_compras?: string | null
          origem?: string | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          preco?: number | null
          preco_promocional?: number | null
          raw_payload?: Json | null
          reservado?: number | null
          saldo?: number | null
          situacao?: string | null
          tiny_id?: number | null
          tipo?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      vw_marketplace_order_items_expanded: {
        Row: {
          marketplace: string | null
          order_id: string | null
          product_name: string | null
          quantity: number | null
          sku: string | null
        }
        Relationships: []
      }
      vw_marketplace_orders_linked: {
        Row: {
          confidence_score: number | null
          link_id: number | null
          linked_at: string | null
          linked_by: string | null
          marketplace: string | null
          marketplace_order_date: string | null
          marketplace_order_display_id: string | null
          marketplace_order_id: string | null
          marketplace_order_status: string | null
          marketplace_total_amount: number | null
          tiny_canal: string | null
          tiny_cliente_nome: string | null
          tiny_data_criacao: string | null
          tiny_numero_pedido: number | null
          tiny_order_id: number | null
          tiny_situacao: number | null
          tiny_valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_order_links_tiny_order_id_fkey"
            columns: ["tiny_order_id"]
            isOneToOne: false
            referencedRelation: "tiny_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_marketplace_sku_mappings: {
        Row: {
          created_at: string | null
          id: number | null
          mapping_type: string | null
          marketplace: string | null
          marketplace_product_name: string | null
          marketplace_sku: string | null
          tiny_codigo: string | null
          tiny_gtin: string | null
          tiny_nome: string | null
          tiny_preco: number | null
          tiny_product_id: number | null
          tiny_saldo: number | null
          tiny_situacao: string | null
          tiny_tipo: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["id_produto_tiny"]
          },
          {
            foreignKeyName: "marketplace_sku_mapping_tiny_product_id_fkey"
            columns: ["tiny_product_id"]
            isOneToOne: false
            referencedRelation: "tiny_produtos_v"
            referencedColumns: ["tiny_id"]
          },
        ]
      }
    }
    Functions: {
      assert_no_magalu_dup: { Args: never; Returns: undefined }
      assert_no_shopee_dup: { Args: never; Returns: undefined }
      auto_link_pending_orders_http: { Args: never; Returns: undefined }
      bytea_to_text: { Args: { data: string }; Returns: string }
      calculate_next_due_date: {
        Args: {
          p_day_of_month: number
          p_day_of_week: number
          p_frequency: string
          p_from_date?: string
        }
        Returns: string
      }
      check_magalu_items_dup: {
        Args: never
        Returns: {
          dup_count: number
          total: number
        }[]
      }
      check_shopee_items_dup: {
        Args: never
        Returns: {
          dup_count: number
          total: number
        }[]
      }
      cron_run_produtos_backfill: { Args: never; Returns: undefined }
      cron_run_tiny_sync: { Args: never; Returns: undefined }
      dashboard_produto_series: {
        Args: {
          p_canais?: string[]
          p_data_fim: string
          p_data_inicio: string
          p_situacoes?: number[]
        }
        Returns: {
          codigo: string
          data: string
          produto_id: number
          quantidade: number
          receita: number
        }[]
      }
      dashboard_resumo_source_max_updated_at: {
        Args: {
          p_canais?: string[]
          p_data_final: string
          p_data_inicial: string
          p_situacoes?: number[]
        }
        Returns: string
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "http_request"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_delete:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_get:
        | {
            Args: { uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
        SetofOptions: {
          from: "*"
          to: "http_header"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_list_curlopt: {
        Args: never
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_post:
        | {
            Args: { content: string; content_type: string; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: { data: Json; uri: string }
            Returns: Database["public"]["CompositeTypes"]["http_response"]
            SetofOptions: {
              from: "*"
              to: "http_response"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
        SetofOptions: {
          from: "*"
          to: "http_response"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      http_reset_curlopt: { Args: never; Returns: boolean }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      magalu_status_resync_http: { Args: never; Returns: undefined }
      magalu_sync_http: { Args: never; Returns: undefined }
      marketplace_auto_link_http: { Args: never; Returns: undefined }
      meli_refresh_token_http: { Args: never; Returns: undefined }
      meli_sync_http: { Args: never; Returns: undefined }
      orders_metrics: {
        Args: {
          p_canais?: string[]
          p_data_final?: string
          p_data_inicial?: string
          p_search?: string
          p_situacoes?: number[]
        }
        Returns: {
          situacao_counts: Json
          total_bruto: number
          total_frete: number
          total_liquido: number
          total_orders: number
        }[]
      }
      refresh_dashboard_resumo_cache: {
        Args: { interval_days?: number }
        Returns: undefined
      }
      shopee_refresh_token_http: { Args: never; Returns: undefined }
      shopee_status_resync_http: { Args: never; Returns: undefined }
      shopee_sync_http: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_calendar_overview: {
        Args: { p_days: number }
        Returns: {
          dia: string
          orders_without_frete: number
          orders_without_items: number
          total_orders: number
        }[]
      }
      text_to_bytea: { Args: { data: string }; Returns: string }
      tiny_estoque_round_robin_http: { Args: never; Returns: undefined }
      tiny_token_refresh_http: { Args: never; Returns: undefined }
      touch_tiny_order_updated_at: {
        Args: { pedido_id: number }
        Returns: undefined
      }
      update_overdue_cash_flow_entries: { Args: never; Returns: undefined }
      urlencode:
        | { Args: { data: Json }; Returns: string }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { string: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.urlencode(string => bytea), public.urlencode(string => varchar). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
