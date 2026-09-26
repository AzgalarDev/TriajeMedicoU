import * as React from 'react';
import { getClinicalPatient, type ClinicalPatient } from '../../lib/api';

export function useClinicalPatient(patientId: string) {
  const [patient, setPatient] = React.useState<ClinicalPatient | null>(null);
  const [error, setError] = React.useState('');
  const requestRef = React.useRef(0);
  const reload = React.useCallback((options?: { preserve?: boolean }) => {
    const requestId = ++requestRef.current;
    if (!options?.preserve) setPatient(null);
    setError('');
    return getClinicalPatient(patientId).then((next) => { if (requestId === requestRef.current) setPatient(next); return next; }).catch((e) => { if (requestId === requestRef.current && !options?.preserve) setError(e instanceof Error ? e.message : 'No se pudo cargar el paciente.'); throw e; });
  }, [patientId]);
  React.useEffect(() => { void reload(); }, [reload]);
  return { patient, error, reload, setPatient };
}
