import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import moment from 'moment';
import { DollarSign, CheckCircle, Clock, Gift, Percent } from 'lucide-react';

export default function Paychecks() {
  const [paychecks, setPaychecks] = useState([]);
  const [payType, setPayType] = useState('hourly');
  const [taxClass, setTaxClass] = useState('1099');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get('/api/paychecks/me');
        if (res.data.success) {
          setPaychecks(res.data.data.paychecks);
          setPayType(res.data.data.pay_type);
          setTaxClass(res.data.data.tax_classification);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load paychecks');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const { upcoming, paid, unpaidPast } = useMemo(() => {
    const upcoming = [];
    const paid = [];
    const unpaidPast = [];
    const now = new Date();
    for (const pc of paychecks) {
      if (pc.is_paid) paid.push(pc);
      else if (pc.upcoming || new Date(pc.period_end) >= now) upcoming.push(pc);
      else unpaidPast.push(pc);
    }
    upcoming.sort((a, b) => new Date(a.period_start) - new Date(b.period_start));
    paid.sort((a, b) => new Date(b.pay_date) - new Date(a.pay_date));
    unpaidPast.sort((a, b) => new Date(b.period_start) - new Date(a.period_start));
    return { upcoming, paid, unpaidPast };
  }, [paychecks]);

  const totalPaid = paid.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPending = unpaidPast.reduce((s, p) => s + (p.amount || 0), 0);
  const totalUpcoming = upcoming.reduce((s, p) => s + (p.amount || 0), 0);

  const payTypeLabel = (
    payType === 'salary' ? 'Salary' :
    payType === 'commission' ? 'Commission only' :
    payType === 'none' ? 'No scheduled paychecks' :
    'Hourly'
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-gray-800 p-4 sm:p-6 rounded-xl shadow-sm border border-gray-700 flex items-center space-x-3">
        <DollarSign className="text-indigo-500 flex-shrink-0" size={28} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-bold text-white">My Paychecks</h2>
          <p className="text-gray-400 text-xs sm:text-sm">{payTypeLabel} · {taxClass} · {moment().year()}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border-l-4 border-red-400 p-4 rounded-md text-red-200 text-sm">{error}</div>
      )}

      {payType === 'none' && paychecks.length === 0 && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300">
          You're not currently on payroll. Bonuses, if any, will appear here.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <SummaryCard label="Paid this year" amount={totalPaid} accent="text-green-400" />
        <SummaryCard label="Upcoming" amount={totalUpcoming} accent="text-yellow-300" />
        <SummaryCard label="Pending past" amount={totalPending} accent="text-orange-300" />
      </div>

      <Section
        title="Upcoming"
        icon={<Clock size={16} className="text-yellow-400" />}
        items={upcoming}
        emptyText={payType === 'none' ? "No paychecks scheduled." : payType === 'commission' ? "No upcoming commission paychecks." : "No upcoming paychecks."}
      />

      {unpaidPast.length > 0 && (
        <Section
          title="Pending (not yet paid)"
          icon={<Clock size={16} className="text-orange-300" />}
          items={unpaidPast}
        />
      )}

      <Section
        title="Paid"
        icon={<CheckCircle size={16} className="text-green-400" />}
        items={paid}
        emptyText="No paychecks have been marked paid yet this year."
      />
    </div>
  );
}

function SummaryCard({ label, amount, accent }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3">
      <p className="text-xs uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>${amount.toFixed(2)}</p>
    </div>
  );
}

function Section({ title, icon, items, emptyText }) {
  return (
    <div className="bg-gray-800 rounded-xl shadow-sm border border-gray-700 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">{emptyText || 'Nothing here.'}</p>
      ) : (
        <div className="space-y-2">
          {items.map(pc => <PaycheckRow key={pc._id} pc={pc} />)}
        </div>
      )}
    </div>
  );
}

function PaycheckRow({ pc }) {
  const baseColor = pc.is_paid
    ? 'border-green-800 bg-green-900/10'
    : pc.is_bonus
      ? 'border-pink-700 bg-pink-900/10'
      : pc.is_commission
        ? 'border-amber-700 bg-amber-900/10'
        : pc.upcoming
          ? 'border-gray-700 bg-gray-900'
          : 'border-orange-700 bg-orange-900/10';

  return (
    <div className={`border rounded-lg p-3 ${baseColor}`}>
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">{pc.period_label}</span>
            {pc.is_bonus && (
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border border-pink-700 text-pink-300 inline-flex items-center gap-1">
                <Gift size={10} /> Bonus
              </span>
            )}
            {pc.is_commission && (
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border border-amber-700 text-amber-300 inline-flex items-center gap-1">
                <Percent size={10} /> Commission
              </span>
            )}
            {pc.upcoming && !pc.is_bonus && !pc.is_commission && (
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border border-gray-600 text-gray-300">Projected</span>
            )}
            {pc.is_paid && (
              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border border-green-700 text-green-300 inline-flex items-center gap-1">
                <CheckCircle size={10} /> Paid
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider border border-gray-600 text-gray-300">{pc.tax_classification || '1099'}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Pay date: {moment(pc.pay_date).format('MMM D, YYYY')}
            {!pc.is_bonus && !pc.is_commission && pc.pay_type === 'hourly' && pc.hours > 0 && (
              <span className="ml-3">{pc.hours.toFixed(2)} hrs</span>
            )}
            {pc.is_paid && pc.paid_at && (
              <span className="ml-3">Paid {moment(pc.paid_at).format('MMM D, YYYY')}</span>
            )}
            {pc.description && <span className="ml-3 italic">{pc.description}</span>}
          </div>
        </div>
        <span className="text-base font-semibold text-green-400 whitespace-nowrap">
          ${(pc.amount || 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
