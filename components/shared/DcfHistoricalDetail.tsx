import React from 'react';
import type { DcfRevisionSnapshot } from '../../lib/dcfRevisionHistory';
import { DcfHistoricalActivity } from './DcfHistoricalActivity';
import { DcfHistoricalSubproject } from './DcfHistoricalSubproject';
import { DcfHistoricalProgramManagement } from './DcfHistoricalProgramManagement';

export function DcfHistoricalDetail({ snapshot }: { snapshot: DcfRevisionSnapshot }) {
    if (snapshot.entityType === 'activities') return <DcfHistoricalActivity snapshot={snapshot} />;
    if (snapshot.entityType === 'subprojects') return <DcfHistoricalSubproject snapshot={snapshot} />;
    return <DcfHistoricalProgramManagement snapshot={snapshot} />;
}
