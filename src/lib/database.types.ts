export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          name: string
          avatar_url: string | null
          is_super_admin: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          avatar_url?: string | null
          is_super_admin?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          avatar_url?: string | null
          is_super_admin?: boolean
          updated_at?: string
        }
      }
      establishments: {
        Row: {
          id: string
          name: string
          slug: string
          address: string | null
          phone: string | null
          plan: 'basic' | 'pro'
          active: boolean
          owner_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          address?: string | null
          phone?: string | null
          plan?: 'basic' | 'pro'
          active?: boolean
          owner_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          slug?: string
          address?: string | null
          phone?: string | null
          plan?: 'basic' | 'pro'
          active?: boolean
          owner_id?: string | null
          updated_at?: string
        }
      }
      establishment_members: {
        Row: {
          id: string
          establishment_id: string
          user_id: string
          role: 'owner' | 'admin' | 'cashier'
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          user_id: string
          role: 'owner' | 'admin' | 'cashier'
          active?: boolean
          created_at?: string
        }
        Update: {
          role?: 'owner' | 'admin' | 'cashier'
          active?: boolean
        }
      }
      categories: {
        Row: {
          id: string
          establishment_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          name?: string
          color?: string
        }
      }
      products: {
        Row: {
          id: string
          establishment_id: string
          category_id: string | null
          name: string
          barcode: string | null
          description: string | null
          price: number
          cost: number
          stock_qty: number
          min_stock: number
          unit: 'un' | 'kg' | 'g' | 'l' | 'ml' | 'cx' | 'm'
          active: boolean
          image_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          category_id?: string | null
          name: string
          barcode?: string | null
          description?: string | null
          price?: number
          cost?: number
          stock_qty?: number
          min_stock?: number
          unit?: 'un' | 'kg' | 'g' | 'l' | 'ml' | 'cx' | 'm'
          active?: boolean
          image_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          name?: string
          barcode?: string | null
          description?: string | null
          price?: number
          cost?: number
          stock_qty?: number
          min_stock?: number
          unit?: 'un' | 'kg' | 'g' | 'l' | 'ml' | 'cx' | 'm'
          active?: boolean
          image_url?: string | null
          updated_at?: string
        }
      }
      stock_movements: {
        Row: {
          id: string
          establishment_id: string
          product_id: string
          type: 'in' | 'out' | 'adjustment'
          qty: number
          reason: string | null
          reference_type: string | null
          reference_id: string | null
          employee_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          product_id: string
          type: 'in' | 'out' | 'adjustment'
          qty: number
          reason?: string | null
          reference_type?: string | null
          reference_id?: string | null
          employee_id?: string | null
          created_at?: string
        }
        Update: {
          reason?: string | null
        }
      }
      sales: {
        Row: {
          id: string
          establishment_id: string
          employee_id: string | null
          tab_id: string | null
          subtotal: number
          discount: number
          total: number
          status: 'completed' | 'cancelled' | 'pending'
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          establishment_id: string
          employee_id?: string | null
          tab_id?: string | null
          subtotal: number
          discount?: number
          total: number
          status?: 'completed' | 'cancelled' | 'pending'
          notes?: string | null
          created_at?: string
        }
        Update: {
          status?: 'completed' | 'cancelled' | 'pending'
          discount?: number
          notes?: string | null
        }
      }
      sale_items: {
        Row: {
          id: string
          sale_id: string
          product_id: string
          qty: number
          unit_price: number
          subtotal: number
        }
        Insert: {
          id?: string
          sale_id: string
          product_id: string
          qty: number
          unit_price: number
          subtotal: number
        }
        Update: Record<string, never>
      }
      sale_payments: {
        Row: {
          id: string
          sale_id: string
          payment_type: 'cash' | 'pix' | 'debit' | 'credit'
          amount: number
          received_amount: number | null
          change_amount: number | null
        }
        Insert: {
          id?: string
          sale_id: string
          payment_type: 'cash' | 'pix' | 'debit' | 'credit'
          amount: number
          received_amount?: number | null
          change_amount?: number | null
        }
        Update: Record<string, never>
      }
      tabs: {
        Row: {
          id: string
          establishment_id: string
          customer_name: string
          table_number: string | null
          employee_id: string | null
          status: 'open' | 'closed' | 'cancelled'
          subtotal: number
          total: number
          notes: string | null
          opened_at: string
          closed_at: string | null
          sale_id: string | null
        }
        Insert: {
          id?: string
          establishment_id: string
          customer_name: string
          table_number?: string | null
          employee_id?: string | null
          status?: 'open' | 'closed' | 'cancelled'
          subtotal?: number
          total?: number
          notes?: string | null
          opened_at?: string
          closed_at?: string | null
          sale_id?: string | null
        }
        Update: {
          customer_name?: string
          table_number?: string | null
          status?: 'open' | 'closed' | 'cancelled'
          subtotal?: number
          total?: number
          notes?: string | null
          closed_at?: string | null
          sale_id?: string | null
        }
      }
      tab_items: {
        Row: {
          id: string
          tab_id: string
          product_id: string
          qty: number
          unit_price: number
          subtotal: number
          added_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tab_id: string
          product_id: string
          qty: number
          unit_price: number
          subtotal: number
          added_by?: string | null
          created_at?: string
        }
        Update: {
          qty?: number
          subtotal?: number
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      is_member_of: { Args: { establishment_id: string }; Returns: boolean }
      is_admin_of: { Args: { establishment_id: string }; Returns: boolean }
      is_super_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: Record<string, never>
  }
}

// Convenience types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Establishment = Database['public']['Tables']['establishments']['Row']
export type EstablishmentMember = Database['public']['Tables']['establishment_members']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type StockMovement = Database['public']['Tables']['stock_movements']['Row']
export type Sale = Database['public']['Tables']['sales']['Row']
export type SaleItem = Database['public']['Tables']['sale_items']['Row']
export type SalePayment = Database['public']['Tables']['sale_payments']['Row']
export type Tab = Database['public']['Tables']['tabs']['Row']
export type TabItem = Database['public']['Tables']['tab_items']['Row']
