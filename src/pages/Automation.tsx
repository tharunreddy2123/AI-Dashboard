import { useTheme } from '../context/ThemeContext';

export default function Automation() {
  const { isDark } = useTheme();

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className={`rounded-3xl border p-10 text-center max-w-xl w-full ${isDark ? 'bg-[#0d1220] border-white/[0.08]' : 'bg-white border-gray-200'}`}>
        <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Automation Disabled</h1>
        <p className={`mt-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          The automation feature has been removed from this deployment. This page remains as a placeholder while Supabase-backed automation is no longer supported.
        </p>
      </div>
    </div>
  );
}
