import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useKbStore } from '@/store/kbStore';
import MemberManage from '@/components/kb/MemberManage';
import { ROLE_LEVELS } from '@/types';

const KbSettingsPage: React.FC = () => {
  const { kbId } = useParams<{ kbId: string }>();
  const { currentKb, fetchKbById, isLoadingKbs } = useKbStore();

  useEffect(() => {
    if (kbId) {
      fetchKbById(kbId);
    }
  }, [kbId]);

  if (isLoadingKbs || !currentKb) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  const myRole = currentKb.my_role ?? 'viewer';
  const canManage = (ROLE_LEVELS[myRole] ?? 0) >= ROLE_LEVELS['admin'];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to={`/kb/${kbId}`} className="hover:text-foreground transition">
            {currentKb.icon} {currentKb.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">成员管理</span>
        </div>

        <h1 className="text-2xl font-bold mb-8">成员管理</h1>

        {!canManage && (
          <div className="mb-6 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
            你当前的角色（{myRole}）没有管理成员的权限。
          </div>
        )}

        <MemberManage kbId={kbId!} currentRole={myRole} />
      </div>
    </div>
  );
};

export default KbSettingsPage;
