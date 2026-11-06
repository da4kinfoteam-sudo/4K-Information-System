import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { chromium } = require(
    path.join(
        process.env.PLAYWRIGHT_NODE_MODULES ||
            'C:/Users/joelm/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules',
        'playwright',
    ),
);
const artifacts = await mkdtemp(path.join(tmpdir(), '4kis-dcf-historical-presentation-'));
const harness = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {DcfHistoricalDetail} from './components/shared/DcfHistoricalDetail';
import {historicalRecord,historicalMonths,historicalNumber,historicalSum,historicalCurrency,historicalDate,historicalTitle} from './lib/dcfHistoricalPresentation';
import {historicalRestoreRows} from './lib/dcfHistoricalLabels';
import {ActivityDetail} from './components/ActivityDetail';
import SubprojectDetail from './components/SubprojectDetail';
import OfficeDetail from './components/program_management/OfficeRequirementDetail';
import StaffingDetail from './components/program_management/StaffingRequirementDetail';
import OtherDetail from './components/program_management/OtherExpenseDetail';
window.adapters={historicalRecord,historicalRestoreRows,historicalNumber,historicalSum,historicalCurrency,historicalDate,historicalTitle};
window.liveReads=[];window.fixtureMode='historical';window.liveSnapshot=null;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
function Harness(){const[snapshot,setSnapshot]=useState(null),[live,setLive]=useState(false);window.showSnapshot=input=>{window.fixtureMode='historical';window.currentHistorical=freeze(input);window.historicalJson=JSON.stringify(input);setLive(false);setSnapshot(input)};window.showLive=input=>{window.fixtureMode='live';window.liveSnapshot=input;setSnapshot(input);setLive(true)};
if(!snapshot)return null;if(!live)return <DcfHistoricalDetail snapshot={snapshot}/>;
const record=historicalRecord(snapshot),noop=()=>{},common={fundSources:[{...snapshot.related.fundSource,is_active:true}],uacsCodes:{MOOE:{Travel:{'50211030-00':'Recorded UACS Description'}}}};
if(snapshot.entityType==='activities')return <ActivityDetail {...common} activity={record} ipos={snapshot.related.ipos||[]} referenceActivities={[snapshot.related.referenceActivity]} onUpdateActivity={noop} onSelectIpo={noop} onEdit={noop}/>;
if(snapshot.entityType==='subprojects')return <SubprojectDetail {...common} subproject={record} ipos={snapshot.related.ipos||[]} onUpdateSubproject={noop} particularTypes={{Crop:['Recorded Seedlings']}} commodityCategories={{}} refCommodities={[]} refLivestock={[]}/>;
return React.createElement({office_requirements:OfficeDetail,staffing_requirements:StaffingDetail,other_program_expenses:OtherDetail}[snapshot.entityType],{...common,item:record,onUpdate:noop});
}
createRoot(document.getElementById('root')).render(<Harness/>);
`;
const bundle = await build({
    stdin: {
        contents: harness,
        resolveDir: process.cwd(),
        sourcefile: 'historical-presentation-fixture.tsx',
        loader: 'tsx',
    },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [
        {
            name: 'no-database',
            setup(api) {
                api.onResolve({ filter: /supabaseClient$/ }, () => ({
                    path: 'offline',
                    namespace: 'fixture',
                }));
                api.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                    contents: `const guard=()=>{if(window.fixtureMode!=='live')throw new Error('Historical rendering attempted database access')};export const supabase={from(table){guard();window.liveReads.push(table);const q={select(){return q},eq(){return q},is(){return q},in(){return q},order(){return q},limit(){return q},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)},insert(){throw Error('Unexpected write')},update(){throw Error('Unexpected write')},delete(){throw Error('Unexpected write')}};return q},rpc(){guard();throw Error('Unexpected RPC in unauthenticated live reference')}};`,
                    loader: 'js',
                }));
                api.onResolve({ filter: /contexts\/AuthContext$/ }, () => ({
                    path: 'auth',
                    namespace: 'auth-fixture',
                }));
                api.onLoad({ filter: /.*/, namespace: 'auth-fixture' }, () => ({
                    contents:
                        "export const useAuth=()=>({currentUser:null,rolesConfigs:[],hasAccess:(_module,action)=>action==='view',getVisibilityScope:()=> 'All'});",
                    loader: 'js',
                }));
                api.onResolve({ filter: /hooks\/useDcfPolicyGuard$/ }, () => ({
                    path: 'policy',
                    namespace: 'policy-fixture',
                }));
                api.onLoad({ filter: /.*/, namespace: 'policy-fixture' }, () => ({
                    contents:
                        "export const useDcfPolicyGuard=()=>({getStatusDecision:()=>({allowed:false}),ensureDecisionAllowed:async()=>false,getMonthDecision:()=>({allowed:false}),getMonthLockMessage:()=>'',isMonthSelectionAllowed:()=>false,getLastOverrideReason:()=>''});export const normalizePolicyMonth=value=>String(value||'').slice(0,7);",
                    loader: 'js',
                }));
            },
        },
    ],
});
const css = await readFile(new URL('../styles/main.css', import.meta.url), 'utf8');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthly = Object.fromEntries(
    months.flatMap((month) => [
        [`disbursement${month}`, 10],
        [`actualDisbursement${month}`, 999],
    ]),
);
function snapshot(entityType, training = false) {
    const line = {
        id: 842199,
        budgetItemGroupId: 'INTERNAL-GROUP-DO-NOT-DISPLAY',
        particulars: 'Recorded Seedlings',
        expenseParticular: 'Recorded Professional Services',
        objectType: 'MOOE',
        uacsCode: '50211030-00',
        amount: 120,
        numberOfUnits: 6,
        pricePerUnit: 20,
        unitOfMeasure: 'Units',
        deliveryDate: '2026-10-01',
        actualDeliveryDate: '2026-11-01',
        actualNumberOfUnits: 6,
        isCompleted: true,
        obligationDate: '2026-09-01',
        targetScheduleVersion: 2,
        targetObligationSchedules: [{ id: 'INTERNAL-PLAN', month: '2026-09-01', amount: 120 }],
        targetDisbursementSchedules: [
            { id: 'INTERNAL-D1', month: '2026-10-01', amount: 60 },
            { id: 'INTERNAL-D2', month: '2026-11-01', amount: 60 },
        ],
        actualObligationAmount: 999,
        actualDisbursementAmount: 999,
        ...monthly,
    };
    const stages = {
        obligation: {
            source: 'central',
            entries: [
                { id: 'INTERNAL-O1', date: '2026-10-01', amount: 20 },
                { id: 'INTERNAL-O2', date: '2026-10-01', amount: 20 },
            ],
        },
        disbursement: { source: 'central', entries: [] },
    };
    return {
        schemaVersion: 1,
        entityType,
        parentId: 92763,
        record: {
            id: 92763,
            uid: 'BUSINESS-UID-2026',
            name: 'Recorded Activity Name',
            activity_title: 'Recorded Optional Title',
            type: training ? 'Training' : 'Activity',
            reference_activity_id: 81,
            component: 'Program Management',
            equipment: 'Recorded Printer',
            personnelPosition: 'Recorded Position',
            particulars: 'Recorded Office Rent',
            operatingUnit: 'RPMO 3',
            fundYear: 2026,
            fundingYear: 2026,
            fundType: 'Current',
            tier: 'Tier 1',
            status: 'Ongoing',
            hiringStatus: 'Filled',
            personnelType: 'Technical',
            salaryGrade: 15,
            annualSalary: 120,
            location: 'Recorded Location',
            date: '2026-10-01',
            description: 'Recorded description ' + 'Long descriptive text '.repeat(30),
            facilitator: 'Recorded Facilitator',
            packageType: 'Crop Production',
            indigenousPeopleOrganization: 'Recorded IPO',
            estimatedCompletionDate: '2026-11-01',
            actualCompletionDate: '2026-11-01',
            participantsMale: 12,
            participantsFemale: 8,
            actualParticipantsMale: 9,
            actualParticipantsFemale: 6,
            actualPWD: 2,
            actualMuslim: 1,
            actualLGBTQ: 0,
            actualSoloParent: 1,
            actualSenior: 2,
            actualYouth: 1,
            actualMaleBeneficiaries: 9,
            actualFemaleBeneficiaries: 6,
            actualFourPsBeneficiaries: 3,
            specs: 'Recorded Specs',
            purpose: 'Recorded Purpose',
            encodedBy: 'Recorded Encoder',
            remarks: 'Recorded Remarks',
            accomplishmentRemarks: 'Recorded Accomplishment Remarks',
            numberOfUnits: 6,
            pricePerUnit: 20,
            amount: 120,
            obligatedAmount: 120,
            uacsCode: '50211030-00',
            physicalDeliveryDate: '2026-10-01',
            obligationDate: '2026-09-01',
            disbursementDate: '2026-10-01',
            actualDate: '2026-11-01',
            actualAmount: 120,
            actualObligationDate: '2026-08-03',
            actualObligationAmount: 999,
            actualDisbursementAmount: 999,
            ...monthly,
            details: [line],
            expenses: [line],
            subprojectCommodities: [
                {
                    name: 'Recorded Cacao',
                    typeName: 'Crop',
                    area: 2,
                    averageYield: 20,
                    actualYield: 15,
                    income: 500,
                    marketingPercentage: 60,
                    foodSecurityPercentage: 40,
                },
            ],
            budgetItemTransferId: 'INTERNAL-TRANSFER',
            workflow_status: 'APPROVED',
            fundSourceUid: 'INTERNAL-FUND',
            participating_ipo_ids: [92],
            participatingIpos: ['Recorded IPO'],
            ipo_id: 92,
            original_budget_snapshot: null,
        },
        financial: {
            obligations: [{ id: 'INTERNAL-O1', item_id: 842199, obligation_date: '2026-10-01', amount: 20 }],
            disbursements: [{ id: 'INTERNAL-STALE-D', item_id: 842199, amount: 999 }],
            stages: { 842199: stages, $parent: stages },
        },
        related: {
            fundSource: { uid: 'INTERNAL-FUND', label: 'Recorded Fund Label' },
            ipos: [{ id: 92, uid: 'IPO-2026', name: 'Recorded IPO', operatingUnit: 'RPMO 3' }],
            referenceActivity: {
                id: 81,
                activity_name: 'Subproject Monitoring',
                component: 'Program Management',
                type: 'Activity',
            },
            activity_supplements: [],
            activity_monitoring_reports: [],
            activity_monitoring_actions: [],
            activity_drive_files: [
                {
                    id: 'INTERNAL-FILE',
                    file_id: 'INTERNAL-DRIVE',
                    file_name: 'Recorded Photo.jpg',
                    upload_section: 'gallery',
                    uploaded_at: '2026-10-02T01:00:00Z',
                    signed_url: 'INTERNAL-SECRET',
                },
            ],
            subproject_drive_files: [],
        },
        physical: { actualPWD: 2 },
    };
}
const headings = {
    activities: [
        'Activity Details',
        'Target Participants',
        'Participating IPOs',
        'Expenses & Budget',
        'Supplemental Information',
        'Accomplishment Report',
        'Monitoring Reports',
        'Gallery',
        'Activity Files',
        'Summary',
        'Attendance Snapshot',
    ],
    subprojects: [
        'Project Details',
        'Target Commodities',
        'Budget Breakdown',
        'Accomplishment Report',
        'Gallery',
        'Subproject Files',
        'Summary',
        'Linked IPO',
        'Remarks',
        'Accomplishment Remarks',
    ],
    office_requirements: ['Requirement Details', 'Accomplishment Report', 'Financial Performance'],
    staffing_requirements: [
        'Requirement Details',
        'Cost Breakdown',
        'Accomplishment Report',
        'Financial Performance Summary',
        'Employment Details',
        'Per Item Actuals',
    ],
    other_program_expenses: [
        'Requirement Details',
        'Target Monthly Disbursement',
        'Accomplishment Report',
        'Financial Performance',
        'Actual Monthly Disbursement',
    ],
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
        errors = [],
        requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
        requests.push(route.request().url());
        return route.abort();
    });
    await page.route('https://historical-fixture.invalid/', (route) =>
        route.fulfill({
            contentType: 'text/html',
            body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div style="max-width:1280px;margin:auto;padding:20px;container-type:inline-size"><div id="root"></div></div></body></html>`,
        }),
    );
    await page.goto('https://historical-fixture.invalid/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForFunction(() => !!window.showSnapshot);
    const findings = [];
    const contracts = {};
    const layoutContract = () =>
        page.evaluate(() => {
            const font = (node) =>
                node
                    ? ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle'].map(
                          (key) => getComputedStyle(node)[key],
                      )
                    : null;
            return {
                titleFont: font(document.querySelector('#root h1')),
                fieldFont: font(document.querySelector('#root .detail-label')),
                valueFont: font(document.querySelector('#root .detail-value')),
                tableFont: font(document.querySelector('#root .data-table th')),
                sections: [
                    ...document.querySelectorAll(
                        '#root .record-detail-panel__heading h2,#root .detail-card > .detail-card-title',
                    ),
                ].map((node) => node.textContent.trim().toLowerCase()),
                kpis: [
                    ...document.querySelectorAll(
                        '#root .record-detail-page > .record-detail-kpi-grid > article',
                    ),
                ].map((node) => [
                    node.querySelector('.record-detail-kpi__label')?.textContent.trim().toLowerCase(),
                    node.querySelector('.record-detail-kpi__value')?.textContent.trim(),
                ]),
                columns: [...document.querySelectorAll('#root .data-table')].map((table) =>
                    [...table.querySelectorAll('thead th')]
                        .map((node) => node.textContent.trim().toLowerCase().replace(/\s+/g, ' '))
                        .filter((label) => label !== 'actions'),
                ),
            };
        });
    for (const [entityType, training] of [
        ['activities', false],
        ['activities', true],
        ['subprojects', false],
        ['office_requirements', false],
        ['staffing_requirements', false],
        ['other_program_expenses', false],
    ]) {
        const input = snapshot(entityType, training),
            original = structuredClone(input);
        const hydrated = await page.evaluate((input) => window.adapters.historicalRecord(input), input);
        const hydratedLine = entityType === 'subprojects' ? hydrated.details[0] : hydrated.expenses[0];
        assert.equal(
            hydratedLine.actualObligationAmount,
            40,
            'Independent equal-valued actuals remain separate',
        );
        assert.equal(
            hydratedLine.actualDisbursementAmount,
            0,
            'Managed-empty overrides stale central/scalar values',
        );
        if (entityType === 'staffing_requirements')
            assert.equal(
                hydrated.actualObligationDate,
                '2026-08-03',
                'Date Hired is not replaced by a ledger date',
            );
        await page.evaluate((input) => window.showSnapshot(input), input);
        await page
            .getByRole('heading', { name: headings[entityType][0], exact: true })
            .waitFor()
            .catch(async (error) => {
                console.error({ entityType, errors, body: await page.locator('body').innerText() });
                throw error;
            });
        assert.deepEqual(input, original);
        for (const heading of headings[entityType])
            assert.equal(
                await page.getByRole('heading', { name: heading, exact: true }).count(),
                1,
                `${entityType}: ${heading}`,
            );
        const content = await page.locator('#root').innerText();
        if (['activities', 'subprojects'].includes(entityType))
            assert.equal(
                await page
                    .locator('article.record-detail-kpi')
                    .filter({ has: page.getByText('Disbursed', { exact: true }) })
                    .locator('.record-detail-kpi__value')
                    .innerText(),
                '₱0',
                'Managed-empty stages cannot revive stale monthly evidence in KPI totals',
            );
        await page.setViewportSize({ width: 1440, height: 1000 });
        contracts[`${entityType}-${training}`] = await layoutContract();
        assert(!content.includes('INTERNAL-'), 'Technical identities/provenance/secrets stay hidden');
        assert(!content.includes('Financial stage provenance'));
        assert(content.includes('BUSINESS-UID-2026'));
        assert.equal(
            await page.locator('input,textarea,select,a[href]').count(),
            0,
            'No mutation controls or current-record navigation',
        );
        if (entityType === 'activities') assert.equal(content.includes('Facilitator'), training);
        if (entityType === 'staffing_requirements') {
            await page.locator('summary').click();
            assert.equal(await page.getByText('Target Monthly Disbursement', { exact: true }).count(), 1);
        }
        for (const width of [1440, 820, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            assert(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
                `${entityType} overflow ${width}`,
            );
            await page.screenshot({
                path: path.join(artifacts, `${entityType}${training ? '-training' : ''}-${width}.png`),
                fullPage: true,
            });
        }
        findings.push({ entityType, training, headings: headings[entityType], viewports: [1440, 820, 390] });
        assert(
            await page.evaluate(() => JSON.stringify(window.currentHistorical) === window.historicalJson),
            'Expanding and viewing do not mutate stored snapshot evidence',
        );
    }
    const complex = snapshot('activities'),
        originalLine = complex.record.expenses[0];
    const second = { ...structuredClone(originalLine), id: 842200 };
    const supplement = {
        ...structuredClone(originalLine),
        id: 842201,
        budgetItemGroupId: undefined,
        amount: 30,
        fundingOrigin: 'Supplemental',
        supplementUid: 'INTERNAL-S',
        supplementStatus: 'APPROVED',
        supplementalSource: 'Savings',
        targetObligationSchedules: [{ id: 'INTERNAL-SO', month: '2026-11-01', amount: 30 }],
        targetDisbursementSchedules: [{ id: 'INTERNAL-SD', month: '2026-12-01', amount: 30 }],
    };
    const pending = {
        ...structuredClone(supplement),
        id: 842202,
        amount: 50,
        supplementUid: 'INTERNAL-P',
        supplementStatus: 'PENDING',
    };
    complex.record.expenses.push(second, supplement, pending);
    complex.record.original_budget_snapshot = { kind: 'original', expenses: [originalLine, second] };
    complex.financial.stages[842200] = structuredClone(complex.financial.stages[842199]);
    complex.financial.stages[842201] = {
        obligation: {
            source: 'central',
            entries: [{ id: 'INTERNAL-SACT-O', date: '2026-11-01', amount: 10 }],
        },
        disbursement: {
            source: 'central',
            entries: [{ id: 'INTERNAL-SACT-D', date: '2026-11-01', amount: 5 }],
        },
    };
    complex.financial.stages[842202] = {
        obligation: { source: 'central', entries: [] },
        disbursement: { source: 'central', entries: [] },
    };
    complex.related.activity_supplements = [
        {
            uid: 'INTERNAL-S',
            source: 'Savings',
            reference: 'AUTH-2026',
            authorization_date: '2026-10-01',
            status: 'APPROVED',
        },
        {
            uid: 'INTERNAL-P',
            source: 'Savings',
            reference: 'PENDING-AUTH-2026',
            authorization_date: '2026-10-01',
            status: 'PENDING',
            pending_proposal: { reason: 'INTERNAL-PROPOSAL' },
        },
    ];
    await page.evaluate((input) => window.showSnapshot(input), complex);
    await page.getByText('AUTH-2026', { exact: true }).waitFor();
    const kpi = (label) =>
        page
            .locator('article.record-detail-kpi')
            .filter({ has: page.getByText(label, { exact: true }) })
            .locator('.record-detail-kpi__value')
            .innerText();
    assert.equal(await kpi('Target Budget'), '₱240');
    assert.equal(await kpi('Supplemental Budget'), '₱30');
    assert.equal(await kpi('Current Active Budget'), '₱270');
    assert.equal(await kpi('Original Allocation'), '₱240');
    assert.equal(await kpi('Obligated'), '₱90');
    assert.equal(await kpi('Disbursed'), '₱5');
    assert.equal(
        await page
            .getByRole('region', { name: 'Expenses & Budget', exact: true })
            .locator('td[rowspan="2"]')
            .count(),
        2,
        'Grouped particulars/UACS preserve native merged cells',
    );
    assert(!(await page.locator('#root').innerText()).includes('INTERNAL-'));
    assert(await page.evaluate(() => JSON.stringify(window.currentHistorical) === window.historicalJson));
    await page.screenshot({
        path: path.join(artifacts, 'activity-grouped-approved-pending-supplements.png'),
        fullPage: true,
    });
    const legacyIpo = snapshot('activities');
    legacyIpo.record.participating_ipo_ids = null;
    legacyIpo.record.participatingIpos = ['Recorded Legacy IPO'];
    legacyIpo.related.ipos = [];
    await page.evaluate((input) => window.showSnapshot(input), legacyIpo);
    await page.getByText('Recorded Legacy IPO', { exact: true }).first().waitFor();
    assert.equal(
        await kpi('Participating IPOs'),
        'Not Recorded',
        'Name-only relationships stay visible without inventing resolved historical IPO identities/counts',
    );
    const missing = snapshot('activities');
    delete missing.record.expenses;
    delete missing.record.participantsMale;
    delete missing.related.ipos;
    await page.evaluate((input) => window.showSnapshot(input), missing);
    await page.waitForFunction(() =>
        document.querySelector('#root')?.textContent.includes('Not Recorded In This Version'),
    );
    assert(
        !(await page
            .locator('#root')
            .innerText()
            .then((text) => text.includes('INTERNAL-'))),
    );
    const friendly = await page.evaluate(
        (input) =>
            window.adapters.historicalRestoreRows(
                [
                    {
                        section: 'Financial actuals',
                        field: 'disbursement / item 842199 / update / entry INTERNAL-ID',
                        before: { id: 'INTERNAL-ID', amount: 20, date: '2026-10-01' },
                        after: { id: 'INTERNAL-ID', amount: 25, date: '2026-11-01' },
                    },
                ],
                input,
            ),
        snapshot('activities'),
    );
    assert(!JSON.stringify(friendly).includes('INTERNAL-'));
    assert(JSON.stringify(friendly).includes('25.00'));
    assert(JSON.stringify(friendly).includes('Update Entry'));
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const legacy = snapshot('office_requirements');
    legacy.financial.stages.$parent.disbursement.entries = [
        { id: 'INTERNAL-Y1', date: '2025-10-01', amount: 7 },
        { id: 'INTERNAL-Y2', date: '2026-10-01', amount: 9 },
    ];
    const monthState = await page.evaluate((input) => window.adapters.historicalRecord(input), legacy);
    assert.equal(
        monthState.actualDisbursementOct,
        16,
        'Monthly detail projection follows live month grouping, not a newly invented year filter',
    );
    assert.equal(monthState.actualDisbursementAmount, 16);
    const numerics = await page.evaluate(() => [
        window.adapters.historicalNumber(''),
        window.adapters.historicalSum(['1.25', '2.75']),
        window.adapters.historicalCurrency('0'),
        window.adapters.historicalDate('2026-02-30'),
        window.adapters.historicalTitle({
            entityType: 'activities',
            record: { type: 'Training', name: 'Training Name', activity_title: 'Ignored Activity Title' },
        }),
    ]);
    assert.deepEqual(numerics, [undefined, 4, '₱0.00', '2026-02-30', 'Training Name']);
    const legacyStaff = snapshot('staffing_requirements');
    legacyStaff.record.expenses = [];
    await page.evaluate((input) => window.showSnapshot(input), legacyStaff);
    await page.getByText('Salaries & Wages', { exact: true }).first().waitFor();
    assert.equal(
        await page.locator('summary').count(),
        1,
        'Legacy Staffing root amounts retain the live Cost Breakdown layout without inventing child identities',
    );
    assert(await page.evaluate(() => JSON.stringify(window.currentHistorical) === window.historicalJson));
    for (const [entityType, training] of [
        ['activities', false],
        ['activities', true],
        ['subprojects', false],
        ['office_requirements', false],
        ['staffing_requirements', false],
        ['other_program_expenses', false],
    ]) {
        const input = snapshot(entityType, training);
        await page.evaluate((input) => window.showLive(input), input);
        await page
            .getByRole('heading', { name: headings[entityType][0], exact: true })
            .waitFor({ timeout: 5000 })
            .catch(async (error) => {
                console.error({ entityType, errors, body: await page.locator('body').innerText() });
                throw error;
            });
        await page.setViewportSize({ width: 1440, height: 1000 });
        const liveContract = await layoutContract(),
            historicalContract = contracts[`${entityType}-${training}`];
        for (const key of ['titleFont', 'fieldFont', 'valueFont', 'tableFont', 'columns', 'sections', 'kpis'])
            assert.deepEqual(
                historicalContract[key],
                liveContract[key],
                `${entityType}/${training}: live ${key} parity`,
            );
        for (const width of [1440, 820, 390]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.screenshot({
                path: path.join(artifacts, `live-${entityType}${training ? '-training' : ''}-${width}.png`),
                fullPage: true,
            });
        }
    }
    assert.deepEqual(errors, []);
    await writeFile(
        path.join(artifacts, 'results.json'),
        JSON.stringify({ passed: true, findings, errors, requests }, null, 2),
    );
    console.log(
        `Historical presentation checks passed for five modules + Training at three widths. Artifacts: ${artifacts}`,
    );
} finally {
    await browser.close();
}
