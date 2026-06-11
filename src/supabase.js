import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Enable mock fallback if Supabase credentials are missing or placeholders
const useMock = !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('placeholder') || supabaseUrl === '';

console.log(`[SplitPay] Initializing in ${useMock ? 'LocalStorage MOCK' : 'PRODUCTION SUPABASE'} mode.`);

let supabase;

if (!useMock) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
} else {
  // --- MOCK DATABASE IMPLEMENTATION ---
  
  // Helper to get local tables
  const getTable = (name) => JSON.parse(localStorage.getItem(`splitpay_${name}`) || '[]');
  const saveTable = (name, data) => localStorage.setItem(`splitpay_${name}`, JSON.stringify(data));

  // Initialize empty tables if not present
  const initTables = () => {
    const tables = ['app_config', 'profiles', 'groups', 'group_members', 'expenses', 'expense_beneficiaries', 'users'];
    tables.forEach(t => {
      if (!localStorage.getItem(`splitpay_${t}`)) {
        localStorage.setItem(`splitpay_${t}`, '[]');
      }
    });
  };
  initTables();

  // Mock Query Builder
  class MockQueryBuilder {
    constructor(table) {
      this.table = table;
      this.filters = [];
      this.isSingle = false;
      this.orderBy = null;
      this.selectFields = '*';
    }

    select(fields = '*') {
      this.selectFields = fields;
      return this;
    }

    eq(col, val) {
      this.filters.push(item => item[col] === val);
      return this;
    }

    in(col, vals) {
      this.filters.push(item => vals.includes(item[col]));
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    order(col, { ascending = true } = {}) {
      this.orderBy = { col, ascending };
      return this;
    }

    // Resolves joins and retrieves data
    getData() {
      let data = getTable(this.table);
      
      // Apply filters
      data = data.filter(item => this.filters.every(f => f(item)));

      // Perform custom joins if requested (hardcoded to emulate Supabase DDL joins)
      if (this.table === 'groups') {
        const profiles = getTable('profiles');
        data = data.map(group => {
          let groupMembers = undefined;
          if (this.selectFields.includes('group_members')) {
            const members = getTable('group_members');
            groupMembers = members
              .filter(m => m.group_id === group.id)
              .map(m => {
                const profile = profiles.find(p => p.id === m.profile_id);
                return { ...m, profiles: profile };
              });
          }

          let expenses = undefined;
          if (this.selectFields.includes('expenses')) {
            const allExpenses = getTable('expenses');
            const beneficiaries = getTable('expense_beneficiaries');
            expenses = allExpenses
              .filter(e => e.group_id === group.id)
              .map(expense => {
                const bList = beneficiaries
                  .filter(b => b.expense_id === expense.id)
                  .map(b => {
                    const profile = profiles.find(p => p.id === b.profile_id);
                    return { ...b, profiles: profile };
                  });
                const payer = profiles.find(p => p.id === expense.paid_by);
                return {
                  ...expense,
                  expense_beneficiaries: bList,
                  profiles: payer
                };
              });
          }

          const creator = profiles.find(p => p.id === group.created_by);

          const result = { ...group };
          if (groupMembers !== undefined) result.group_members = groupMembers;
          if (expenses !== undefined) result.expenses = expenses;
          result.profiles = creator;
          return result;
        });
      }

      if (this.table === 'expenses' && this.selectFields.includes('expense_beneficiaries')) {
        const beneficiaries = getTable('expense_beneficiaries');
        const profiles = getTable('profiles');
        data = data.map(expense => {
          const bList = beneficiaries
            .filter(b => b.expense_id === expense.id)
            .map(b => {
              const profile = profiles.find(p => p.id === b.profile_id);
              return { ...b, profiles: profile };
            });
          
          const payer = profiles.find(p => p.id === expense.paid_by);
          return {
            ...expense,
            expense_beneficiaries: bList,
            profiles: payer
          };
        });
      }

      // Sort
      if (this.orderBy) {
        const { col, ascending } = this.orderBy;
        data.sort((a, b) => {
          let valA = a[col];
          let valB = b[col];
          if (valA === undefined || valB === undefined) return 0;
          if (typeof valA === 'string') {
            return ascending ? valA.localeCompare(valB) : valB.localeCompare(valA);
          }
          return ascending ? valA - valB : valB - valA;
        });
      }

      return data;
    }

    async then(resolve) {
      try {
        let data = this.getData();
        if (this.isSingle) {
          data = data.length > 0 ? data[0] : null;
        }
        resolve({ data, error: null });
      } catch (e) {
        console.error('Mock Query Error:', e);
        resolve({ data: null, error: { message: e.message } });
      }
    }

    async insert(rowOrRows) {
      const data = getTable(this.table);
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const inserted = rows.map(r => {
        const newRow = { ...r };
        if (this.table === 'groups' && !newRow.id) newRow.id = crypto.randomUUID();
        if (this.table === 'expenses' && !newRow.id) newRow.id = crypto.randomUUID();
        if (!newRow.created_at) newRow.created_at = new Date().toISOString();
        return newRow;
      });

      data.push(...inserted);
      saveTable(this.table, data);

      // Trigger Simulation for handle_new_user and admin setup
      if (this.table === 'profiles') {
        const configs = getTable('app_config');
        const adminConfig = configs.find(c => c.key === 'admin_uuid');
        
        // If there's no admin configuration, the first inserted profile becomes admin and is approved
        if (!adminConfig) {
          configs.push({
            key: 'admin_uuid',
            value: inserted[0].id,
            created_at: new Date().toISOString()
          });
          saveTable('app_config', configs);
          
          // Force approved status for first user (admin)
          inserted[0].status = 'approved';
          saveTable('profiles', getTable('profiles').map(p => p.id === inserted[0].id ? { ...p, status: 'approved' } : p));
        }
      }

      return {
        data: Array.isArray(rowOrRows) ? inserted : inserted[0],
        error: null,
        // Mock chain methods
        select: () => ({
          single: () => ({ data: inserted[0], error: null })
        })
      };
    }

    async update(updateData) {
      const data = getTable(this.table);
      let updated = data.map(item => {
        const matches = this.filters.every(f => f(item));
        if (matches) {
          return { ...item, ...updateData };
        }
        return item;
      });
      saveTable(this.table, updated);
      return { data: null, error: null };
    }

    async delete() {
      const data = getTable(this.table);
      const remaining = data.filter(item => !this.filters.every(f => f(item)));
      saveTable(this.table, remaining);
      return { data: null, error: null };
    }
  }

  // Session state stored inside window/local variable for reactivity
  let currentSession = null;
  const storedSession = localStorage.getItem('splitpay_session');
  if (storedSession) {
    try {
      currentSession = JSON.parse(storedSession);
    } catch (_) {}
  }

  const authCallbacks = [];

  supabase = {
    auth: {
      async signUp({ email, password, options = {} }) {
        const users = getTable('users');
        if (users.find(u => u.email === email)) {
          return { data: null, error: { message: 'User already exists.' } };
        }

        const newUser = {
          id: crypto.randomUUID(),
          email,
          password // Mocking plain password check
        };
        users.push(newUser);
        saveTable('users', users);

        // Simulate DB trigger: insert into profiles
        const profiles = getTable('profiles');
        const displayName = options.data?.username || email.split('@')[0];
        const newProfile = {
          id: newUser.id,
          email,
          username: displayName,
          payment_link: options.data?.payment_link || '',
          phone_number: options.data?.phone_number || '',
          iban: options.data?.iban || '',
          status: 'pending', // Starts as pending, will trigger admin setup on profiles insert
          created_at: new Date().toISOString()
        };
        
        // Use insert query builder to run the admin config check triggers
        const query = new MockQueryBuilder('profiles');
        await query.insert(newProfile);

        // Get the updated profile to see if it got approved as admin
        const updatedProfiles = getTable('profiles');
        const savedProfile = updatedProfiles.find(p => p.id === newUser.id);

        const session = {
          access_token: 'mock-token',
          user: { id: newUser.id, email },
          profile: savedProfile
        };

        currentSession = session;
        localStorage.setItem('splitpay_session', JSON.stringify(session));
        authCallbacks.forEach(cb => cb('SIGNED_IN', session));

        return { data: { user: newUser, session }, error: null };
      },

      async signInWithPassword({ email, password }) {
        const users = getTable('users');
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) {
          return { data: null, error: { message: 'Invalid credentials.' } };
        }

        const profiles = getTable('profiles');
        const profile = profiles.find(p => p.id === user.id);

        const session = {
          access_token: 'mock-token',
          user: { id: user.id, email },
          profile
        };

        currentSession = session;
        localStorage.setItem('splitpay_session', JSON.stringify(session));
        authCallbacks.forEach(cb => cb('SIGNED_IN', session));

        return { data: { user, session }, error: null };
      },

      async signOut() {
        currentSession = null;
        localStorage.removeItem('splitpay_session');
        authCallbacks.forEach(cb => cb('SIGNED_OUT', null));
        return { error: null };
      },

      async getSession() {
        return { data: { session: currentSession }, error: null };
      },

      async getUser() {
        return { data: { user: currentSession?.user || null }, error: null };
      },

      async updateUser(updateData) {
        if (!currentSession) {
          return { data: null, error: { message: 'Not authenticated.' } };
        }

        if (updateData.password) {
          // Mettre à jour le mot de passe dans la table users
          const users = getTable('users');
          const updatedUsers = users.map(u => {
            if (u.id === currentSession.user.id) {
              return { ...u, password: updateData.password };
            }
            return u;
          });
          saveTable('users', updatedUsers);
        }

        return { data: { user: currentSession.user }, error: null };
      },

      async resetPasswordForEmail(email, options = {}) {
        const users = getTable('users');
        const user = users.find(u => u.email === email);
        if (!user) {
          // Simuler Supabase qui ne révèle pas si l'email existe ou non
          return { data: null, error: null };
        }

        // En mode mock, on stocke un token de recovery dans le user
        const recoveryToken = crypto.randomUUID();
        const updatedUsers = users.map(u => {
          if (u.email === email) {
            return { ...u, recovery_token: recoveryToken, recovery_expires: Date.now() + 3600000 };
          }
          return u;
        });
        saveTable('users', updatedUsers);

        // Simuler l'envoi de l'email : stocker le lien dans localStorage
        const recoveryLinks = JSON.parse(localStorage.getItem('splitpay_recovery_links') || '[]');
        recoveryLinks.push({
          email,
          token: recoveryToken,
          redirectTo: options.redirectTo || '',
          created: new Date().toISOString()
        });
        localStorage.setItem('splitpay_recovery_links', JSON.stringify(recoveryLinks));

        return { data: null, error: null };
      },

      async verifyOtp({ type, token_hash }) {
        if (type !== 'recovery') {
          return { data: null, error: { message: 'Invalid OTP type.' } };
        }

        const users = getTable('users');
        const user = users.find(u => u.recovery_token === token_hash);

        if (!user || user.recovery_expires < Date.now()) {
          return { data: null, error: { message: 'Invalid or expired recovery token.' } };
        }

        // Créer une session temporaire pour permettre le changement de mot de passe
        const profiles = getTable('profiles');
        const profile = profiles.find(p => p.id === user.id);

        const session = {
          access_token: 'mock-token-recovery',
          user: { id: user.id, email: user.email },
          profile,
          is_recovery: true
        };

        currentSession = session;
        localStorage.setItem('splitpay_session', JSON.stringify(session));
        authCallbacks.forEach(cb => cb('PASSWORD_RECOVERY', session));

        return { data: { session }, error: null };
      },

      onAuthStateChange(callback) {
        authCallbacks.push(callback);
        // Call immediately with current state
        callback(currentSession ? 'SIGNED_IN' : 'SIGNED_OUT', currentSession);
        return {
          data: {
            subscription: {
              unsubscribe() {
                const idx = authCallbacks.indexOf(callback);
                if (idx !== -1) authCallbacks.splice(idx, 1);
              }
            }
          }
        };
      }
    },

    from(table) {
      return new MockQueryBuilder(table);
    }
  };
}

export { supabase, useMock }

export function useSupabase() {
  return { supabase, useMock }
}
