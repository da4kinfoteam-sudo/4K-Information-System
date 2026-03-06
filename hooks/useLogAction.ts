
// Author: 4K
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

export const useLogAction = () => {
    const { currentUser } = useAuth();

    const logAction = async (action: string, details: string, ipoName?: string, entityType?: string, entityId?: string) => {
        if (!currentUser || !supabase) return;

        let description = `${action}: ${details}`;
        if (ipoName) {
            description += ` (Linked IPO: ${ipoName})`;
        }

        try {
            await supabase.from('user_logs').insert([{
                description: description,
                username: currentUser.username,
                operating_unit: currentUser.operatingUnit,
                created_at: new Date().toISOString(),
                entity_type: entityType,
                entity_id: entityId
            }]);
        } catch (error) {
            console.error("Failed to log action:", error);
        }
    };

    return { logAction };
};
