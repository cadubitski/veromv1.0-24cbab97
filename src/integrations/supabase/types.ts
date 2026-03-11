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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          account_digit: string | null
          account_name: string
          account_number: string
          active: boolean
          agency_digit: string | null
          agency_number: string
          bank_code: string
          bank_name: string
          company_id: string
          created_at: string
          current_balance: number
          external_account_id: string | null
          external_provider: string | null
          id: string
          initial_balance: number
          updated_at: string
        }
        Insert: {
          account_digit?: string | null
          account_name: string
          account_number: string
          active?: boolean
          agency_digit?: string | null
          agency_number: string
          bank_code: string
          bank_name: string
          company_id: string
          created_at?: string
          current_balance?: number
          external_account_id?: string | null
          external_provider?: string | null
          id?: string
          initial_balance?: number
          updated_at?: string
        }
        Update: {
          account_digit?: string | null
          account_name?: string
          account_number?: string
          active?: boolean
          agency_digit?: string | null
          agency_number?: string
          bank_code?: string
          bank_name?: string
          company_id?: string
          created_at?: string
          current_balance?: number
          external_account_id?: string | null
          external_provider?: string | null
          id?: string
          initial_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          person_type: string
          phone: string | null
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          person_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          person_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          cnpj: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          cnpj?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_templates: {
        Row: {
          company_id: string
          conteudo_markdown: string
          created_at: string
          descricao: string | null
          entidades_utilizadas: Json
          id: string
          nome_modelo: string
          updated_at: string
        }
        Insert: {
          company_id: string
          conteudo_markdown?: string
          created_at?: string
          descricao?: string | null
          entidades_utilizadas?: Json
          id?: string
          nome_modelo: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          conteudo_markdown?: string
          created_at?: string
          descricao?: string | null
          entidades_utilizadas?: Json
          id?: string
          nome_modelo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      income_tax_brackets: {
        Row: {
          company_id: string
          created_at: string
          deduction: number
          id: string
          range_end: number | null
          range_start: number
          rate: number
          updated_at: string
          valid_from_date: string
        }
        Insert: {
          company_id: string
          created_at?: string
          deduction?: number
          id?: string
          range_end?: number | null
          range_start?: number
          rate?: number
          updated_at?: string
          valid_from_date?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          deduction?: number
          id?: string
          range_end?: number | null
          range_start?: number
          rate?: number
          updated_at?: string
          valid_from_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_tax_brackets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          birth_date: string | null
          company_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          must_change_password: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          company_id: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          company_id?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          area_m2: number | null
          client_id: string
          code: string
          company_id: string
          created_at: string
          id: string
          municipal_registration: string | null
          negotiation_percent: number | null
          property_type_id: string | null
          purpose: string
          registry_number: string | null
          rent_value: number | null
          sale_value: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_m2?: number | null
          client_id: string
          code: string
          company_id: string
          created_at?: string
          id?: string
          municipal_registration?: string | null
          negotiation_percent?: number | null
          property_type_id?: string | null
          purpose?: string
          registry_number?: string | null
          rent_value?: number | null
          sale_value?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_m2?: number | null
          client_id?: string
          code?: string
          company_id?: string
          created_at?: string
          id?: string
          municipal_registration?: string | null
          negotiation_percent?: number | null
          property_type_id?: string | null
          purpose?: string
          registry_number?: string | null
          rent_value?: number | null
          sale_value?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_property_type_id_fkey"
            columns: ["property_type_id"]
            isOneToOne: false
            referencedRelation: "property_types"
            referencedColumns: ["id"]
          },
        ]
      }
      property_types: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_contracts: {
        Row: {
          code: string | null
          company_id: string
          created_at: string
          due_day: number
          duration_months: number
          id: string
          management_fee_percent: number
          management_fee_value: number | null
          property_id: string
          rent_value: number
          repasse_value: number | null
          start_date: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          company_id: string
          created_at?: string
          due_day: number
          duration_months: number
          id?: string
          management_fee_percent?: number
          management_fee_value?: number | null
          property_id: string
          rent_value: number
          repasse_value?: number | null
          start_date: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          company_id?: string
          created_at?: string
          due_day?: number
          duration_months?: number
          id?: string
          management_fee_percent?: number
          management_fee_value?: number | null
          property_id?: string
          rent_value?: number
          repasse_value?: number | null
          start_date?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_installments: {
        Row: {
          company_id: string
          competence: string
          contract_id: string
          created_at: string
          due_date: string
          id: string
          ir_deduction: number | null
          ir_rate: number | null
          irrf_value: number | null
          management_fee_percent: number
          management_fee_value: number | null
          owner_net_value: number | null
          paid_at: string | null
          repasse_value: number | null
          status: string
          tax_base_value: number | null
          updated_at: string
          value: number
        }
        Insert: {
          company_id: string
          competence: string
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          ir_deduction?: number | null
          ir_rate?: number | null
          irrf_value?: number | null
          management_fee_percent?: number
          management_fee_value?: number | null
          owner_net_value?: number | null
          paid_at?: string | null
          repasse_value?: number | null
          status?: string
          tax_base_value?: number | null
          updated_at?: string
          value: number
        }
        Update: {
          company_id?: string
          competence?: string
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          ir_deduction?: number | null
          ir_rate?: number | null
          irrf_value?: number | null
          management_fee_percent?: number
          management_fee_value?: number | null
          owner_net_value?: number | null
          paid_at?: string | null
          repasse_value?: number | null
          status?: string
          tax_base_value?: number | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "rental_installments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_installments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "rental_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          company_id: string
          created_at: string
          document: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          person_type: string
          phone: string | null
          status: string
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          company_id: string
          created_at?: string
          document?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          person_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          company_id?: string
          created_at?: string
          document?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          person_type?: string
          phone?: string | null
          status?: string
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
