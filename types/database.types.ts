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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          business_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          business_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          business_name?: string | null;
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
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          phone?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          phone?: string;
          notes?: string | null;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          user_id: string;
          sale_id: string;
          amount: number;
          payment_number?: number | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          sale_id?: string;
          amount?: number;
          payment_number?: number | null;
          notes?: string | null;
          created_at?: string;
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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      product_category: ProductCategory;
      sale_status: SaleStatus;
      preorder_status: PreorderStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}