export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProductCategory = "ROPA" | "CALZADO" | "PERFUME" | "OTRO";
export type SaleStatus = "PENDING" | "PARTIAL" | "COMPLETED";
export type PreorderStatus = "PENDENT" | "ORDERED" | "DELIVERED" | "CANCELLED";
export type ProfileRole = "owner" | "super_admin";
export type ProfileStatus = "TRIAL" | "ACTIVE" | "SUSPENDED" | "EXPIRED";
export type PaymentReportStatus = "PENDING" | "CONFIRMED" | "REJECTED";
export type StockMovementKind = "ENTRADA" | "VENTA" | "SALIDA" | "AJUSTE";
export type PaymentMethodKind =
  | "PAGO_MOVIL"
  | "TRANSFERENCIA"
  | "ZELLE"
  | "BINANCE"
  | "EFECTIVO"
  | "OTRO";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          business_name: string | null;
          role: ProfileRole;
          status: ProfileStatus;
          trial_ends_at: string | null;
          subscription_ends_at: string | null;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          business_name?: string | null;
          role?: ProfileRole;
          status?: ProfileStatus;
          trial_ends_at?: string | null;
          subscription_ends_at?: string | null;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          business_name?: string | null;
          role?: ProfileRole;
          status?: ProfileStatus;
          trial_ends_at?: string | null;
          subscription_ends_at?: string | null;
          logo_url?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          notes: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          phone?: string;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          phone?: string;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      sales: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          item_description: string;
          category: ProductCategory;
          total_amount: number;
          installments_count: number;
          installment_amount: number;
          amount_paid: number;
          status: SaleStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          deleted_via: string | null;
          first_charge_date: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          item_description: string;
          category?: ProductCategory;
          total_amount: number;
          installments_count?: number;
          amount_paid?: number;
          status?: SaleStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
          first_charge_date?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          item_description?: string;
          category?: ProductCategory;
          total_amount?: number;
          installments_count?: number;
          amount_paid?: number;
          status?: SaleStatus;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
          first_charge_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sales_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          sale_id: string;
          amount: number;
          payment_number: number | null;
          notes: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_via: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          sale_id: string;
          amount: number;
          payment_number?: number | null;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          sale_id?: string;
          amount?: number;
          payment_number?: number | null;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_sale_id_fkey";
            columns: ["sale_id"];
            referencedRelation: "sales";
            referencedColumns: ["id"];
          }
        ];
      };
      preorders: {
        Row: {
          id: string;
          user_id: string;
          client_id: string | null;
          client_name_raw: string | null;
          product_name: string;
          category: ProductCategory;
          quantity: number | null;
          estimated_price: number | null;
          status: PreorderStatus;
          notes: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id?: string | null;
          client_name_raw?: string | null;
          product_name: string;
          category?: ProductCategory;
          quantity?: number | null;
          estimated_price?: number | null;
          status?: PreorderStatus;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string | null;
          client_name_raw?: string | null;
          product_name?: string;
          category?: ProductCategory;
          quantity?: number | null;
          estimated_price?: number | null;
          status?: PreorderStatus;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "preorders_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "preorders_client_id_fkey";
            columns: ["client_id"];
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      products: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: ProductCategory;
          stock: number;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          category?: ProductCategory;
          stock?: number;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: ProductCategory;
          stock?: number;
          created_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "products_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_methods: {
        Row: {
          id: string;
          user_id: string;
          kind: PaymentMethodKind;
          label: string | null;
          bank: string | null;
          account: string | null;
          holder: string | null;
          document: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          kind: PaymentMethodKind;
          label?: string | null;
          bank?: string | null;
          account?: string | null;
          holder?: string | null;
          document?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: PaymentMethodKind;
          label?: string | null;
          bank?: string | null;
          account?: string | null;
          holder?: string | null;
          document?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          sale_id: string | null;
          kind: StockMovementKind;
          quantity: number;
          notes: string | null;
          created_at: string;
          deleted_at: string | null;
          deleted_via: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          sale_id?: string | null;
          kind: StockMovementKind;
          quantity: number;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          sale_id?: string | null;
          kind?: StockMovementKind;
          quantity?: number;
          notes?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deleted_via?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_sale_id_fkey";
            columns: ["sale_id"];
            referencedRelation: "sales";
            referencedColumns: ["id"];
          }
        ];
      };
      payment_reports: {
        Row: {
          id: string;
          user_id: string;
          amount: number | null;
          method: string;
          reference: string | null;
          proof_path: string | null;
          notes: string | null;
          status: PaymentReportStatus;
          created_at: string;
          reviewed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string;
          amount?: number | null;
          method: string;
          reference?: string | null;
          proof_path?: string | null;
          notes?: string | null;
          status?: PaymentReportStatus;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number | null;
          method?: string;
          reference?: string | null;
          proof_path?: string | null;
          notes?: string | null;
          status?: PaymentReportStatus;
          created_at?: string;
          reviewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "payment_reports_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      store_emails: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          email: string | null;
        }[];
      };
    };
    Enums: {
      product_category: ProductCategory;
      sale_status: SaleStatus;
      preorder_status: PreorderStatus;
      profile_role: ProfileRole;
      profile_status: ProfileStatus;
      payment_report_status: PaymentReportStatus;
      stock_movement_kind: StockMovementKind;
      payment_method_kind: PaymentMethodKind;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}