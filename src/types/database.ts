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
    PostgrestVersion: "14.5"
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
      assignments: {
        Row: {
          created_at: string
          created_by: string | null
          from_user_id: string | null
          id: string
          lead_id: string
          reason: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_user_id?: string | null
          id?: string
          lead_id: string
          reason: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string
          reason?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          created_at: string
          id: string
          user_id: string
          work_date: string
        }
        Insert: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          id?: string
          user_id: string
          work_date: string
        }
        Update: {
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          created_at?: string
          id?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      geofences: {
        Row: {
          id: string
          lat: number
          lng: number
          project_id: string
          radius_m: number
        }
        Insert: {
          id?: string
          lat: number
          lng: number
          project_id: string
          radius_m?: number
        }
        Update: {
          id?: string
          lat?: number
          lng?: number
          project_id?: string
          radius_m?: number
        }
        Relationships: [
          {
            foreignKeyName: "geofences_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          created_at: string
          duplicates: number
          error_report: Json | null
          errors: number
          filename: string
          id: string
          inserted: number
          total_rows: number
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          duplicates?: number
          error_report?: Json | null
          errors?: number
          filename: string
          id?: string
          inserted?: number
          total_rows?: number
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          duplicates?: number
          error_report?: Json | null
          errors?: number
          filename?: string
          id?: string
          inserted?: number
          total_rows?: number
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          from_value: string | null
          id: string
          lead_id: string
          remark: string | null
          to_value: string | null
          user_id: string | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          from_value?: string | null
          id?: string
          lead_id: string
          remark?: string | null
          to_value?: string | null
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          from_value?: string | null
          id?: string
          lead_id?: string
          remark?: string | null
          to_value?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          campaign: string | null
          created_at: string
          id: string
          lead_id: string
          raw_payload: Json | null
          received_at: string
          source_id: string
        }
        Insert: {
          campaign?: string | null
          created_at?: string
          id?: string
          lead_id: string
          raw_payload?: Json | null
          received_at?: string
          source_id: string
        }
        Update: {
          campaign?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          raw_payload?: Json | null
          received_at?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          budget_max: number | null
          budget_min: number | null
          call_status: Database["public"]["Enums"]["call_status"]
          created_at: string
          first_touch_at: string | null
          id: string
          is_live: boolean
          last_activity_at: string | null
          location_id: string
          next_call_at: string | null
          notes: string | null
          person_id: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          project_id: string
          renurture_at: string | null
          sla_breached_at: string | null
          sla_due_at: string | null
          temperature: Database["public"]["Enums"]["temperature"] | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          call_status?: Database["public"]["Enums"]["call_status"]
          created_at?: string
          first_touch_at?: string | null
          id?: string
          is_live?: boolean
          last_activity_at?: string | null
          location_id: string
          next_call_at?: string | null
          notes?: string | null
          person_id: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          project_id: string
          renurture_at?: string | null
          sla_breached_at?: string | null
          sla_due_at?: string | null
          temperature?: Database["public"]["Enums"]["temperature"] | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          budget_max?: number | null
          budget_min?: number | null
          call_status?: Database["public"]["Enums"]["call_status"]
          created_at?: string
          first_touch_at?: string | null
          id?: string
          is_live?: boolean
          last_activity_at?: string | null
          location_id?: string
          next_call_at?: string | null
          notes?: string | null
          person_id?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          project_id?: string
          renurture_at?: string | null
          sla_breached_at?: string | null
          sla_due_at?: string | null
          temperature?: Database["public"]["Enums"]["temperature"] | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          lead_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          lead_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          lead_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          developer: string | null
          id: string
          is_active: boolean
          location_id: string
          name: string
        }
        Insert: {
          created_at?: string
          developer?: string | null
          id?: string
          is_active?: boolean
          location_id: string
          name: string
        }
        Update: {
          created_at?: string
          developer?: string | null
          id?: string
          is_active?: boolean
          location_id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      round_robin_state: {
        Row: {
          last_user_id: string | null
          scope_key: string
          updated_at: string
        }
        Insert: {
          last_user_id?: string | null
          scope_key: string
          updated_at?: string
        }
        Update: {
          last_user_id?: string | null
          scope_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_robin_state_last_user_id_fkey"
            columns: ["last_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          accompanied_by: string | null
          checkin_at: string | null
          checkin_lat: number | null
          checkin_lng: number | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          outcome: string | null
          project_id: string
          remark: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["visit_status"]
          within_geofence: boolean | null
        }
        Insert: {
          accompanied_by?: string | null
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          outcome?: string | null
          project_id: string
          remark?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["visit_status"]
          within_geofence?: boolean | null
        }
        Update: {
          accompanied_by?: string | null
          checkin_at?: string | null
          checkin_lat?: number | null
          checkin_lng?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          outcome?: string | null
          project_id?: string
          remark?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["visit_status"]
          within_geofence?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_accompanied_by_fkey"
            columns: ["accompanied_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          code: string
          id: string
          is_live: boolean
          name: string
        }
        Insert: {
          code: string
          id?: string
          is_live?: boolean
          name: string
        }
        Update: {
          code?: string
          id?: string
          is_live?: boolean
          name?: string
        }
        Relationships: []
      }
      user_availability: {
        Row: {
          delegate_to: string | null
          status: Database["public"]["Enums"]["availability_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          delegate_to?: string | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          delegate_to?: string | null
          status?: Database["public"]["Enums"]["availability_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_availability_delegate_to_fkey"
            columns: ["delegate_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_hierarchy: {
        Row: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Insert: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Update: {
          ancestor_id?: string
          depth?: number
          descendant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_hierarchy_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_hierarchy_descendant_id_fkey"
            columns: ["descendant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_scopes: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_scopes_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_scopes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          parent_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          parent_id?: string | null
          phone?: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          parent_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "users_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      dashboard_counts: { Args: { p_range: string }; Returns: Json }
      dashboard_portfolios: { Args: { p_range: string }; Returns: Json }
      import_leads_batch: {
        Args: {
          p_campaign: string
          p_import: string
          p_rows: Json
          p_source: string
        }
        Returns: Json
      }
      lead_counts_by_owner: {
        Args: never
        Returns: {
          open: number
          owner_id: string
          total: number
        }[]
      }
      move_leads: {
        Args: { p_moves: Json; p_reason: string; p_restart_sla?: boolean }
        Returns: number
      }
      set_user_scopes: {
        Args: { p_locations: string[]; p_projects: string[]; p_user: string }
        Returns: undefined
      }
    }
    Enums: {
      availability_status: "available" | "on_site_visit" | "off"
      call_status: "new" | "attempted" | "connected" | "lost"
      pipeline_stage:
        | "enquiry"
        | "qualified"
        | "site_visit_scheduled"
        | "site_visit_done"
        | "negotiation"
        | "booked"
        | "dropped"
      temperature: "hot" | "warm" | "cold"
      user_role: "super_admin" | "admin" | "manager" | "sub_manager" | "caller"
      visit_status: "scheduled" | "done" | "no_show" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      availability_status: ["available", "on_site_visit", "off"],
      call_status: ["new", "attempted", "connected", "lost"],
      pipeline_stage: [
        "enquiry",
        "qualified",
        "site_visit_scheduled",
        "site_visit_done",
        "negotiation",
        "booked",
        "dropped",
      ],
      temperature: ["hot", "warm", "cold"],
      user_role: ["super_admin", "admin", "manager", "sub_manager", "caller"],
      visit_status: ["scheduled", "done", "no_show", "cancelled"],
    },
  },
} as const
