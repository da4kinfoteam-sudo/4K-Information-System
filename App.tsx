

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Subprojects from './components/Subprojects';
import IPOs from './components/IPO';
import IPODetail from './components/IPODetail';
import SubprojectDetail from './components/SubprojectDetail';
import { IPO, Subproject, Training, OtherActivity, HistoryEntry, fundTypes, tiers } from './constants';
import DashboardsPage from './components/DashboardsPage';
// FIX: Import TrainingsComponent to resolve "Cannot find name 'TrainingsComponent'" error.
import TrainingsComponent from './components/Trainings';
import OtherActivitiesComponent from './components/OtherActivities';

const initialIpos: IPO[] = [
    // Original 8
    { id: 1, name: 'San Isidro Farmers Association', acronym: 'SIFA', location: 'Brgy. San Isidro, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-12345', registeringBody: 'SEC', isWomenLed: true, isWithinGida: false, isWithinElcac: false, isWithScad: true, contactPerson: 'Juan Dela Cruz', contactNumber: '09171234567', registrationDate: '2021-05-20', commodities: [{ type: 'Crop Commodity', particular: 'Rice Seeds', value: 50, isScad: true }], levelOfDevelopment: 3, lat: 14.5986, lng: 121.2885, history: [ { date: '2024-02-01', user: 'J. Smith', event: "Contact person changed to 'Juan Dela Cruz'." }, { date: '2023-08-15', user: 'A. Rivera', event: "Level of Development updated from 2 to 3." }, { date: '2022-11-20', user: 'A. Rivera', event: "Added commodity: Rice Seeds (50 value)." }, { date: '2021-05-20', user: 'System', event: 'IPO profile created.' }, ] },
    { id: 2, name: 'Pinugay Upland Farmers Org.', acronym: 'PUFO', location: 'Brgy. Pinugay, Baras, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat', ancestralDomainNo: 'AD-67890', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: true, isWithinElcac: false, isWithScad: false, contactPerson: 'Maria Clara', contactNumber: '09181234567', registrationDate: '2022-03-15', commodities: [{ type: 'Livestock', particular: 'Goats', value: 100, isScad: false }], levelOfDevelopment: 2, lat: 14.5779, lng: 121.2625, history: [ { date: '2023-05-05', user: 'M. Garcia', event: "Updated location to 'Brgy. Pinugay, Baras, Rizal'." }, { date: '2022-03-15', user: 'System', event: 'IPO profile created.' }, ] },
    { id: 3, name: 'Macaingalan IP Farmers Assoc.', acronym: 'MIPFA', location: 'Brgy. Macaingalan, General Nakar, Quezon', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Agta', ancestralDomainNo: 'AD-54321', registeringBody: 'CDA', isWomenLed: false, isWithinGida: true, isWithinElcac: true, isWithScad: true, contactPerson: 'Pedro Penduko', contactNumber: '09191234567', registrationDate: '2022-08-10', commodities: [{ type: 'Crop Commodity', particular: 'Coffee Seedlings', value: 15, isScad: true }], levelOfDevelopment: 1, lat: 14.7744, lng: 121.6315 },
    { id: 4, name: 'Daraitan Farmers Cooperative', acronym: 'DAFACO', location: 'Brgy. Daraitan, Tanay, Rizal', region: 'CALABARZON (Region IV-A)', indigenousCulturalCommunity: 'Dumagat-Remontado', ancestralDomainNo: 'AD-09876', registeringBody: 'National Commission on Indigenous Peoples', isWomenLed: true, isWithinGida: false, isWithinElcac: false, isWithScad: false, contactPerson: 'Gabriela Silang', contactNumber: '09201234567', registrationDate: '2023-01-30', commodities: [], levelOfDevelopment: 1, lat: 14.6191, lng: 121.3653 },
    { id: 5, name: 'Marilog District Coffee Growers Association', acronym: 'MDCGA', location: 'Brgy. Marilog, Davao City, Davao del Sur', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Bagobo Tagabawa', ancestralDomainNo: 'AD-DVO-1101', registeringBody: 'CDA', isWomenLed: true, isWithinGida: true, isWithinElcac: true, isWithScad: true, contactPerson: 'Bae Liza Saway', contactNumber: '09172345678', registrationDate: '2022-04-12', commodities: [{ type: 'Crop Commodity', particular: 'Coffee Seedlings', value: 100, isScad: true }], levelOfDevelopment: 4, lat: 7.5139, lng: 125.2672 },
    { id: 6, name: 'Malita Cacao Farmers Cooperative', acronym: 'MCFC', location: 'Brgy. Buhangin, Malita, Davao Occidental', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Blaan', ancestralDomainNo: 'AD-DVO-1102', registeringBody: 'CDA', isWomenLed: false, isWithinGida: true, isWithinElcac: false, isWithScad: false, contactPerson: 'Datu Isidro Inda', contactNumber: '09182345678', registrationDate: '2021-11-20', commodities: [], levelOfDevelopment: 2, lat: 6.4039, lng: 125.6111 },
    { id: 7, name: 'New Bataan Banana Growers Association', acronym: 'NBGA', location: 'Brgy. Camanlangan, New Bataan, Davao de Oro', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Mansaka', ancestralDomainNo: 'AD-DVO-1103', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: false, isWithinElcac: false, isWithScad: false, contactPerson: 'Mario Agpawa', contactNumber: '09202345678', registrationDate: '2023-02-28', commodities: [], levelOfDevelopment: 1, lat: 7.5303, lng: 126.1558 },
    { id: 8, name: 'Samal Island Seaweeds Planters Org.', acronym: 'SISPO', location: 'Brgy. Adecor, Island Garden City of Samal, Davao del Norte', region: 'Davao Region (Region XI)', indigenousCulturalCommunity: 'Sama', ancestralDomainNo: 'AD-DVO-1104', registeringBody: 'SEC', isWomenLed: true, isWithinGida: false, isWithinElcac: false, isWithScad: false, contactPerson: 'Fatima M. Santos', contactNumber: '09212345678', registrationDate: '2022-09-05', commodities: [], levelOfDevelopment: 1, lat: 7.0781, lng: 125.7197 },
    // New 7
    { id: 9, name: 'Bukidnon Indigenous Peoples Cooperative', acronym: 'BIPC', location: 'Brgy. Sungco, Lantapan, Bukidnon', region: 'Northern Mindanao (Region X)', indigenousCulturalCommunity: 'Talaandig', ancestralDomainNo: 'AD-BUK-1001', registeringBody: 'CDA', isWomenLed: true, isWithinGida: true, isWithinElcac: true, isWithScad: true, contactPerson: 'Datu Migketay Saway', contactNumber: '09173456789', registrationDate: '2020-07-22', commodities: [{ type: 'Crop Commodity', particular: 'Corn Seeds', value: 200, isScad: true }, { type: 'Livestock', particular: 'Cattle', value: 50, isScad: false }], levelOfDevelopment: 4, lat: 8.0536, lng: 124.9625 },
    { id: 10, name: 'Lake Sebu T\'boli Weavers Association', acronym: 'LSTWA', location: 'Brgy. Poblacion, Lake Sebu, South Cotabato', region: 'SOCCSKSARGEN (Region XII)', indigenousCulturalCommunity: 'T\'boli', ancestralDomainNo: 'AD-SK-1201', registeringBody: 'DOLE', isWomenLed: true, isWithinGida: true, isWithinElcac: false, isWithScad: false, contactPerson: 'Maria Todi', contactNumber: '09183456789', registrationDate: '2021-02-14', commodities: [], levelOfDevelopment: 2, lat: 6.2231, lng: 124.6961 },
    { id: 11, name: 'Apayao Isneg Community Organization', acronym: 'AICO', location: 'Brgy. Bacsay, Kabugao, Apayao', region: 'Cordillera Administrative Region (CAR)', indigenousCulturalCommunity: 'Isneg', ancestralDomainNo: 'AD-CAR-0101', registeringBody: 'SEC', isWomenLed: false, isWithinGida: true, isWithinElcac: true, isWithScad: false, contactPerson: 'Manuel Agliam', contactNumber: '09203456789', registrationDate: '2022-11-10', commodities: [{ type: 'Crop Commodity', particular: 'Fertilizer', value: 30, isScad: false }], levelOfDevelopment: 1, lat: 17.9947, lng: 121.1969 },
    { id: 12, name: 'Palawan Tagbanua Rattan Gatherers', acronym: 'PTRG', location: 'Brgy. San Rafael, Puerto Princesa, Palawan', region: 'MIMAROPA (Region IV-B)', indigenousCulturalCommunity: 'Tagbanua', ancestralDomainNo: 'AD-PAL-0401', registeringBody: 'National Commission on Indigenous Peoples', isWomenLed: false, isWithinGida: false, isWithinElcac: false, isWithScad: false, contactPerson: 'Arturo Magbanua', contactNumber: '09213456789', registrationDate: '2023-04-05', commodities: [], levelOfDevelopment: 1, lat: 9.7392, lng: 118.735 },
    { id: 13, name: 'Zambales Aeta Abaca Growers Inc.', acronym: 'ZAAGI', location: 'Brgy. Poonbato, Botolan, Zambales', region: 'Central Luzon (Region III)', indigenousCulturalCommunity: 'Aeta', ancestralDomainNo: 'AD-ZAM-0301', registeringBody: 'SEC', isWomenLed: false, isWithinGida: true, isWithinElcac: false, isWithScad: true, contactPerson: 'Ka Bayani', contactNumber: '09193456789', registrationDate: '2021-08-30', commodities: [{ type: 'Crop Commodity', particular: 'Pesticides', value: 10, isScad: true }], levelOfDevelopment: 3, lat: 15.2933, lng: 120.0247 },
    { id: 14, name: 'Tawi-Tawi Bajau Seaweed Farmers', acronym: 'TBSF', location: 'Brgy. Pasiagan, Bongao, Tawi-Tawi', region: 'Caraga (Region XIII)', indigenousCulturalCommunity: 'Bajau', ancestralDomainNo: 'AD-TAW-1501', registeringBody: 'CDA', isWomenLed: true, isWithinGida: true, isWithinElcac: true, isWithScad: false, contactPerson: 'Nur-Aina Jala', contactNumber: '09174567890', registrationDate: '2022-06-25', commodities: [], levelOfDevelopment: 2, lat: 5.0289, lng: 119.7731 },
    { id: 15, name: 'Ifugao Rice Terraces Farmers Guild', acronym: 'IRTG', location: 'Brgy. Batad, Banaue, Ifugao', region: 'Cordillera Administrative Region (CAR)', indigenousCulturalCommunity: 'Ifugao', ancestralDomainNo: 'AD-CAR-0102', registeringBody: 'DOLE', isWomenLed: false, isWithinGida: false, isWithinElcac: false, isWithScad: true, contactPerson: 'Domingo Taguiling', contactNumber: '09184567890', registrationDate: '2020-03-12', commodities: [{ type: 'Crop Commodity', particular: 'Rice Seeds', value: 75, isScad: true }], levelOfDevelopment: 5, lat: 16.9583, lng: 121.0583 }
];

// FIX: Added missing properties (objectCode, obligationMonth, disbursementMonth) to all SubprojectDetail objects to match the type definition.
const initialSubprojects: Subproject[] = [
    // Original 8
    { id: 1, name: 'Communal Irrigation System', location: 'Brgy. San Isidro, Tanay, Rizal', indigenousPeopleOrganization: 'San Isidro Farmers Association', status: 'Completed', packageType: 'Package 1', startDate: '2022-01-15', estimatedCompletionDate: '2022-12-31', actualCompletionDate: '2022-11-30', remarks: 'Completed ahead of schedule. All systems functioning optimally.', lat: 14.5333, lng: 121.3167, fundingYear: 2022, fundType: 'Current', tier: 'Tier 1', details: [ { id: 1, type: 'Infrastructure', particulars: 'Cement', deliveryDate: '2022-02-01', unitOfMeasure: 'pcs', pricePerUnit: 250, numberOfUnits: 10000, objectCode: 'CO', obligationMonth: '2022-01-20', disbursementMonth: '2022-02-15' }, { id: 2, type: 'Infrastructure', particulars: 'Skilled Labor', deliveryDate: '2022-03-01', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1, objectCode: 'MOOE', obligationMonth: '2022-02-20', disbursementMonth: '2022-03-15' }, ], history: [ { date: '2022-11-30', user: 'J. Smith', event: "Status updated from 'Ongoing' to 'Completed'." }, { date: '2022-03-01', user: 'A. Rivera', event: "All skilled labor has been mobilized." }, { date: '2022-02-01', user: 'A. Rivera', event: "Cement delivery completed." }, { date: '2022-01-15', user: 'System', event: 'Subproject created.' }, ] },
    { id: 2, name: 'Farm-to-Market Road', location: 'Brgy. Pinugay, Baras, Rizal', indigenousPeopleOrganization: 'Pinugay Upland Farmers Org.', status: 'Ongoing', packageType: 'Package 3', startDate: '2023-03-01', estimatedCompletionDate: '2024-03-01', actualCompletionDate: '', remarks: 'Slight delay due to weather conditions in Q4 2023.', lat: 14.5779, lng: 121.2625, fundingYear: 2023, fundType: 'Continuing', tier: 'Tier 2', details: [ { id: 1, type: 'Infrastructure', particulars: 'Gravel and Sand', deliveryDate: '2023-03-15', unitOfMeasure: 'lot', pricePerUnit: 3000000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-03-05', disbursementMonth: '2023-03-20' }, { id: 2, type: 'Others', particulars: 'Heavy Equipment Rental', deliveryDate: '2023-03-20', unitOfMeasure: 'lot', pricePerUnit: 2000000, numberOfUnits: 1, objectCode: 'MOOE', obligationMonth: '2023-03-10', disbursementMonth: '2023-03-25' }, { id: 3, type: 'Others', particulars: 'Project Management', deliveryDate: '2023-03-01', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1, objectCode: 'MOOE', obligationMonth: '2023-03-01', disbursementMonth: '2023-03-10' }, ], history: [ { date: '2023-03-15', user: 'M. Garcia', event: "Gravel and Sand delivered." }, { date: '2023-03-01', user: 'System', event: 'Subproject created.' }, ] },
    { id: 3, name: 'Coffee Production & Processing', location: 'Sitio Macaingalan, Gen. Nakar, Quezon', indigenousPeopleOrganization: 'Macaingalan IP Farmers Assoc.', status: 'Proposed', packageType: 'Package 2', startDate: '2024-08-01', estimatedCompletionDate: '2025-08-01', actualCompletionDate: '', remarks: 'Awaiting final approval of budget.', lat: 14.7744, lng: 121.6315, fundingYear: 2024, fundType: 'Insertion', tier: 'Tier 1', details: [ { id: 1, type: 'Crop Commodity', particulars: 'Coffee Seedlings', deliveryDate: '2024-08-15', unitOfMeasure: 'pcs', pricePerUnit: 50, numberOfUnits: 50000, objectCode: 'MOOE', obligationMonth: '2024-08-01', disbursementMonth: '2024-08-20' }, { id: 2, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2024-09-01', unitOfMeasure: 'unit', pricePerUnit: 700000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2024-08-20', disbursementMonth: '2024-09-10' }, ], history: [{ date: '2024-06-01', user: 'System', event: 'Subproject created.' }] },
    { id: 4, name: 'Water System for Agriculture', location: 'Brgy. Daraitan, Tanay, Rizal', indigenousPeopleOrganization: 'Daraitan Farmers Cooperative', status: 'Ongoing', packageType: 'Package 1', startDate: '2023-06-20', estimatedCompletionDate: '2024-06-20', actualCompletionDate: '', remarks: 'On track, currently in phase 2 of implementation.', lat: 14.6191, lng: 121.3653, fundingYear: 2023, fundType: 'Current', tier: 'Tier 1', details: [ { id: 1, type: 'Infrastructure', particulars: 'Pipes and Fittings', deliveryDate: '2023-07-01', unitOfMeasure: 'lot', pricePerUnit: 2100000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-06-25', disbursementMonth: '2023-07-10' }, { id: 2, type: 'Equipment', particulars: 'Water Pump', deliveryDate: '2023-07-05', unitOfMeasure: 'unit', pricePerUnit: 1000000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-06-28', disbursementMonth: '2023-07-12' }, { id: 3, type: 'Infrastructure', particulars: 'Installation Labor', deliveryDate: '2023-07-10', unitOfMeasure: 'lot', pricePerUnit: 1000000, numberOfUnits: 1, objectCode: 'MOOE', obligationMonth: '2023-07-01', disbursementMonth: '2023-07-15' }, ], history: [{ date: '2023-06-20', user: 'System', event: 'Subproject created.' }] },
    { id: 5, name: 'Arabica Coffee Processing Facility', location: 'Brgy. Marilog, Davao City, Davao del Sur', indigenousPeopleOrganization: 'Marilog District Coffee Growers Association', status: 'Ongoing', packageType: 'Package 2', startDate: '2023-05-10', estimatedCompletionDate: '2024-05-10', actualCompletionDate: '', remarks: 'Construction of processing building is 50% complete.', lat: 7.5139, lng: 125.2672, fundingYear: 2023, fundType: 'Current', tier: 'Tier 2', details: [ { id: 1, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2023-08-01', unitOfMeasure: 'unit', pricePerUnit: 350000, numberOfUnits: 2, objectCode: 'CO', obligationMonth: '2023-07-20', disbursementMonth: '2023-08-10' }, { id: 2, type: 'Infrastructure', particulars: 'Processing Shed', deliveryDate: '2023-05-20', unitOfMeasure: 'lot', pricePerUnit: 1200000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-05-15', disbursementMonth: '2023-05-30' }, ], history: [{ date: '2023-05-10', user: 'System', event: 'Subproject created.' }] },
    { id: 6, name: 'Cacao Fermentation and Drying Facility', location: 'Brgy. Buhangin, Malita, Davao Occidental', indigenousPeopleOrganization: 'Malita Cacao Farmers Cooperative', status: 'Completed', packageType: 'Package 2', startDate: '2022-01-20', estimatedCompletionDate: '2022-10-31', actualCompletionDate: '2022-09-15', remarks: 'Turned over to the IPO and is now fully operational.', lat: 6.4039, lng: 125.6111, fundingYear: 2022, fundType: 'Current', tier: 'Tier 1', details: [ { id: 1, type: 'Equipment', particulars: 'Processing Equipment', deliveryDate: '2022-03-01', unitOfMeasure: 'unit', pricePerUnit: 500000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2022-02-15', disbursementMonth: '2022-03-10' }, { id: 2, type: 'Infrastructure', particulars: 'Warehouse', deliveryDate: '2022-02-01', unitOfMeasure: 'lot', pricePerUnit: 800000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2022-01-25', disbursementMonth: '2022-02-10' }, ], history: [ { date: '2022-09-15', user: 'J. Smith', event: "Status updated from 'Ongoing' to 'Completed'." }, { date: '2022-01-20', user: 'System', event: 'Subproject created.' }, ] },
    { id: 7, name: 'Rehabilitation of Banana Farm-to-Market Road', location: 'Brgy. Camanlangan, New Bataan, Davao de Oro', indigenousPeopleOrganization: 'New Bataan Banana Growers Association', status: 'Proposed', packageType: 'Package 3', startDate: '2024-09-01', estimatedCompletionDate: '2025-09-01', actualCompletionDate: '', remarks: 'For validation and approval by the regional office.', lat: 7.5303, lng: 126.1558, fundingYear: 2024, fundType: 'Current', tier: 'Tier 1', details: [ { id: 1, type: 'Infrastructure', particulars: 'Gravel and Sand', deliveryDate: '2024-09-15', unitOfMeasure: 'lot', pricePerUnit: 4000000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2024-09-05', disbursementMonth: '2024-09-20' }, { id: 2, type: 'Others', particulars: 'Heavy Equipment Rental', deliveryDate: '2024-09-20', unitOfMeasure: 'lot', pricePerUnit: 2500000, numberOfUnits: 1, objectCode: 'MOOE', obligationMonth: '2024-09-10', disbursementMonth: '2024-09-25' }, ], history: [{ date: '2024-07-01', user: 'System', event: 'Subproject created.' }] },
    { id: 8, name: 'Seaweed Nursery and Post-Harvest Facility', location: 'Brgy. Adecor, Island Garden City of Samal, Davao del Norte', indigenousPeopleOrganization: 'Samal Island Seaweeds Planters Org.', status: 'Ongoing', packageType: 'Package 1', startDate: '2023-07-01', estimatedCompletionDate: '2024-07-01', actualCompletionDate: '', remarks: 'Nursery establishment complete. Awaiting materials for drying facility.', lat: 7.0781, lng: 125.7197, fundingYear: 2023, fundType: 'Continuing', tier: 'Tier 1', details: [ { id: 1, type: 'Equipment', particulars: 'Floating cages', deliveryDate: '2023-07-15', unitOfMeasure: 'unit', pricePerUnit: 10000, numberOfUnits: 50, objectCode: 'CO', obligationMonth: '2023-07-05', disbursementMonth: '2023-07-20' }, { id: 2, type: 'Infrastructure', particulars: 'Storage unit', deliveryDate: '2023-08-01', unitOfMeasure: 'lot', pricePerUnit: 300000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-07-20', disbursementMonth: '2023-08-10' }, ], history: [{ date: '2023-07-01', user: 'System', event: 'Subproject created.' }] },
    // New 7
    { id: 9, name: 'Corn Post-Harvest Facility', location: 'Brgy. Sungco, Lantapan, Bukidnon', indigenousPeopleOrganization: 'Bukidnon Indigenous Peoples Cooperative', status: 'Completed', packageType: 'Package 2', startDate: '2021-04-01', estimatedCompletionDate: '2022-03-31', actualCompletionDate: '2022-02-28', remarks: 'Facility is fully operational and has increased corn yield quality.', lat: 8.0536, lng: 124.9625, fundingYear: 2021, fundType: 'Current', tier: 'Tier 1', details: [{ id: 1, type: 'Equipment', particulars: 'Thresher', deliveryDate: '2021-06-01', unitOfMeasure: 'unit', pricePerUnit: 450000, numberOfUnits: 2, objectCode: 'CO', obligationMonth: '2021-05-15', disbursementMonth: '2021-06-10' }], history: [] },
    { id: 10, name: 'Abaca Fiber Production Support', location: 'Brgy. Poonbato, Botolan, Zambales', indigenousPeopleOrganization: 'Zambales Aeta Abaca Growers Inc.', status: 'Ongoing', packageType: 'Package 1', startDate: '2023-08-15', estimatedCompletionDate: '2024-08-15', actualCompletionDate: '', remarks: 'Training on fiber extraction ongoing.', lat: 15.2933, lng: 120.0247, fundingYear: 2023, fundType: 'Current', tier: 'Tier 2', details: [{ id: 1, type: 'Equipment', particulars: 'Harvester', deliveryDate: '2023-09-01', unitOfMeasure: 'unit', pricePerUnit: 800000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2023-08-20', disbursementMonth: '2023-09-10' }], history: [] },
    { id: 11, name: 'Heirloom Rice Production Enhancement', location: 'Brgy. Batad, Banaue, Ifugao', indigenousPeopleOrganization: 'Ifugao Rice Terraces Farmers Guild', status: 'Proposed', packageType: 'Package 1', startDate: '2024-06-01', estimatedCompletionDate: '2025-06-01', actualCompletionDate: '', remarks: 'Awaiting DA-CAR approval.', lat: 16.9583, lng: 121.0583, fundingYear: 2024, fundType: 'Insertion', tier: 'Tier 1', details: [{ id: 1, type: 'Crop Commodity', particulars: 'Fertilizer', deliveryDate: '2024-07-01', unitOfMeasure: 'kgs', pricePerUnit: 1200, numberOfUnits: 500, objectCode: 'MOOE', obligationMonth: '2024-06-15', disbursementMonth: '2024-07-10' }], history: [] },
    { id: 12, name: 'Rehabilitation of Mangrove Forest for Aquaculture', location: 'Brgy. San Rafael, Puerto Princesa, Palawan', indigenousPeopleOrganization: 'Palawan Tagbanua Rattan Gatherers', status: 'Ongoing', packageType: 'Package 3', startDate: '2023-01-10', estimatedCompletionDate: '2024-12-31', actualCompletionDate: '', remarks: 'Nursery for mangrove saplings established.', lat: 9.7392, lng: 118.735, fundingYear: 2023, fundType: 'Continuing', tier: 'Tier 2', details: [], history: [] },
    { id: 13, name: 'Cattle Fattening and Breeding Program', location: 'Brgy. Bacsay, Kabugao, Apayao', indigenousPeopleOrganization: 'Apayao Isneg Community Organization', status: 'Completed', packageType: 'Package 1', startDate: '2022-05-20', estimatedCompletionDate: '2023-05-20', actualCompletionDate: '2023-04-30', remarks: 'Initial herd has successfully calved.', lat: 17.9947, lng: 121.1969, fundingYear: 2022, fundType: 'Current', tier: 'Tier 1', details: [{ id: 1, type: 'Livestock', particulars: 'Cattle', deliveryDate: '2022-06-01', unitOfMeasure: 'pcs', pricePerUnit: 40000, numberOfUnits: 50, objectCode: 'CO', obligationMonth: '2022-05-25', disbursementMonth: '2022-06-10' }], history: [] },
    { id: 14, name: 'T\'nalak Weaving and Enterprise Center', location: 'Brgy. Poblacion, Lake Sebu, South Cotabato', indigenousPeopleOrganization: 'Lake Sebu T\'boli Weavers Association', status: 'Ongoing', packageType: 'Package 2', startDate: '2022-09-01', estimatedCompletionDate: '2024-09-01', actualCompletionDate: '', remarks: 'Building construction at 75%.', lat: 6.2231, lng: 124.6961, fundingYear: 2022, fundType: 'Continuing', tier: 'Tier 1', details: [{ id: 1, type: 'Infrastructure', particulars: 'Processing Shed', deliveryDate: '2022-10-01', unitOfMeasure: 'lot', pricePerUnit: 1500000, numberOfUnits: 1, objectCode: 'CO', obligationMonth: '2022-09-15', disbursementMonth: '2022-10-10' }], history: [] },
    { id: 15, name: 'Community-based Seaweed Farming', location: 'Brgy. Pasiagan, Bongao, Tawi-Tawi', indigenousPeopleOrganization: 'Tawi-Tawi Bajau Seaweed Farmers', status: 'Cancelled', packageType: 'Package 1', startDate: '2023-03-01', estimatedCompletionDate: '2024-03-01', actualCompletionDate: '', remarks: 'Cancelled due to security concerns in the area.', lat: 5.0289, lng: 119.7731, fundingYear: 2023, fundType: 'Current', tier: 'Tier 1', details: [], history: [] },
];

const initialTrainings: Training[] = [
    // Original 5
    { id: 1, name: 'Financial Literacy Seminar', date: '2022-02-10', description: 'Basic financial management for farmers.', location: 'Tanay, Rizal', facilitator: 'Rural Bank of Tanay', participatingIpos: ['San Isidro Farmers Association', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885, participantsMale: 15, participantsFemale: 25, trainingExpenses: 50000, component: 'Social Preparation' },
    { id: 2, name: 'Sustainable Farming Practices', date: '2022-07-22', description: 'Workshop on organic farming and soil health.', location: 'Baras, Rizal', facilitator: 'DA-RFO IV-A', participatingIpos: ['Pinugay Upland Farmers Org.'], lat: 14.5308, lng: 121.2721, participantsMale: 30, participantsFemale: 10, trainingExpenses: 75000, component: 'Production and Livelihood' },
    { id: 3, name: 'Post-Harvest Technology Workshop', date: '2023-04-18', description: 'Training on modern post-harvest techniques to reduce spoilage.', location: 'Gen. Nakar, Quezon', facilitator: 'PhilMech', participatingIpos: ['Macaingalan IP Farmers Assoc.'], lat: 14.7744, lng: 121.6315, participantsMale: 22, participantsFemale: 18, trainingExpenses: 120000, component: 'Production and Livelihood' },
    { id: 4, name: 'Cooperative Management Training', date: '2023-09-05', description: 'Advanced course on managing a cooperative effectively.', location: 'Tanay, Rizal', facilitator: 'CDA', participatingIpos: ['San Isidro Farmers Association', 'Pinugay Upland Farmers Org.', 'Daraitan Farmers Cooperative'], lat: 14.5986, lng: 121.2885, participantsMale: 40, participantsFemale: 35, trainingExpenses: 85000, component: 'Program Management' },
    { id: 5, name: 'Marketing and Linkaging Forum', date: '2024-01-20', description: 'Connecting farmers to potential buyers and markets.', location: 'Online', facilitator: 'DA-AMAS', participatingIpos: ['Macaingalan IP Farmers Assoc.', 'Daraitan Farmers Cooperative'], participantsMale: 18, participantsFemale: 22, trainingExpenses: 25000, component: 'Marketing and Enterprise' },
    // New 10
    { id: 6, name: 'High-Value Crops Production', date: '2022-05-15', description: 'Training on cultivating high-value crops like coffee and cacao.', location: 'Davao City', facilitator: 'DA-RFO XI', participatingIpos: ['Marilog District Coffee Growers Association', 'Malita Cacao Farmers Cooperative'], lat: 7.0645, lng: 125.607, participantsMale: 25, participantsFemale: 30, trainingExpenses: 150000, component: 'Production and Livelihood' },
    { id: 7, name: 'Organizational Leadership', date: '2023-11-22', description: 'Developing leadership skills for IPO officers.', location: 'Malaybalay, Bukidnon', facilitator: 'LGU Lantapan', participatingIpos: ['Bukidnon Indigenous Peoples Cooperative'], lat: 8.1576, lng: 125.093, participantsMale: 10, participantsFemale: 15, trainingExpenses: 60000, component: 'Program Management' },
    { id: 8, name: 'Traditional Weaving and Product Development', date: '2022-08-10', description: 'Enhancing skills in T\'nalak weaving and exploring new product designs.', location: 'Lake Sebu, South Cotabato', facilitator: 'DTI - Region XII', participatingIpos: ['Lake Sebu T\'boli Weavers Association'], lat: 6.2231, lng: 124.6961, participantsMale: 5, participantsFemale: 45, trainingExpenses: 95000, component: 'Marketing and Enterprise' },
    { id: 9, name: 'Climate-Resilient Agriculture', date: '2024-02-28', description: 'Adapting farming practices to changing climate conditions.', location: 'Online', facilitator: 'PAGASA', participatingIpos: ['Apayao Isneg Community Organization', 'Ifugao Rice Terraces Farmers Guild', 'Zambales Aeta Abaca Growers Inc.'], participantsMale: 50, participantsFemale: 40, trainingExpenses: 30000, component: 'Production and Livelihood' },
    { id: 10, name: 'Ecotourism and Site Management', date: '2023-06-12', description: 'Managing community-based ecotourism sites.', location: 'Puerto Princesa, Palawan', facilitator: 'DOT - MIMAROPA', participatingIpos: ['Palawan Tagbanua Rattan Gatherers'], lat: 9.7392, lng: 118.735, participantsMale: 20, participantsFemale: 10, trainingExpenses: 110000, component: 'Marketing and Enterprise' },
    { id: 11, name: 'Abaca Fiber Quality Grading', date: '2023-10-03', description: 'Standardizing abaca fiber quality for better market prices.', location: 'Botolan, Zambales', facilitator: 'PhilFIDA', participatingIpos: ['Zambales Aeta Abaca Growers Inc.'], lat: 15.2933, lng: 120.0247, participantsMale: 35, participantsFemale: 15, trainingExpenses: 70000, component: 'Production and Livelihood' },
    { id: 12, name: 'Marine Protected Area Management', date: '2023-01-25', description: 'Community-based management of marine resources.', location: 'Bongao, Tawi-Tawi', facilitator: 'BFAR', participatingIpos: ['Tawi-Tawi Bajau Seaweed Farmers', 'Samal Island Seaweeds Planters Org.'], lat: 5.0289, lng: 119.7731, participantsMale: 28, participantsFemale: 22, trainingExpenses: 130000, component: 'Social Preparation' },
    { id: 13, name: 'Bookkeeping and Simple Accounting', date: '2022-04-20', description: 'Essential bookkeeping skills for IPO treasurers.', location: 'Online', facilitator: 'TESDA', participatingIpos: ['Bukidnon Indigenous Peoples Cooperative', 'Malita Cacao Farmers Cooperative'], participantsMale: 12, participantsFemale: 18, trainingExpenses: 20000, component: 'Program Management' },
    { id: 14, name: 'Good Agricultural Practices (GAP) for Rice', date: '2021-09-18', description: 'Certification training for Good Agricultural Practices.', location: 'Banaue, Ifugao', facilitator: 'PhilRice', participatingIpos: ['Ifugao Rice Terraces Farmers Guild'], lat: 16.9583, lng: 121.0583, participantsMale: 40, participantsFemale: 20, trainingExpenses: 80000, component: 'Production and Livelihood' },
    { id: 15, name: 'Project Proposal Writing', date: '2024-03-10', description: 'Workshop on how to write effective project proposals.', location: 'Quezon City', facilitator: 'DA-NPMO', participatingIpos: ['Daraitan Farmers Cooperative', 'Apayao Isneg Community Organization'], lat: 14.6760, lng: 121.0437, participantsMale: 15, participantsFemale: 15, trainingExpenses: 45000, component: 'Social Preparation' }
];

const initialOtherActivities: OtherActivity[] = [
    // Original 3
    { id: 1, component: 'Social Preparation', name: 'Community Needs Assessment', date: '2023-02-20', description: 'Assessed the needs of the community to identify potential subprojects.', location: 'Brgy. San Isidro, Tanay, Rizal', participatingIpos: ['San Isidro Farmers Association'], participantsMale: 20, participantsFemale: 25, expenses: [{ id: 1, objectCode: 'MOOE', obligationMonth: '2023-02-15', disbursementMonth: '2023-02-28', amount: 30000 }] },
    { id: 2, component: 'Program Management', name: 'Sub-Project Monitoring', date: '2023-10-05', description: 'Monitored the ongoing Communal Irrigation System project.', location: 'Brgy. San Isidro, Tanay, Rizal', participatingIpos: [], participantsMale: 0, participantsFemale: 0, expenses: [{ id: 1, objectCode: 'MOOE', obligationMonth: '2023-10-01', disbursementMonth: '2023-10-15', amount: 15000 }] },
    { id: 3, component: 'Marketing and Enterprise', name: 'Market Linkaging', date: '2024-03-15', description: 'Connected coffee growers with local cafes and distributors.', location: 'Brgy. Marilog, Davao City, Davao del Sur', participatingIpos: ['Marilog District Coffee Growers Association'], participantsMale: 15, participantsFemale: 18, expenses: [{ id: 1, objectCode: 'MOOE', obligationMonth: '2024-03-10', disbursementMonth: '2024-03-20', amount: 45000 }] },
    // New 12
    { id: 4, component: 'Program Management', name: 'Performance and Budget Utilization Review (PBUR)', date: '2023-06-30', description: 'Quarterly review of project performance and budget utilization.', location: 'Online', participatingIpos: [], participantsMale: 0, participantsFemale: 0, expenses: [{ id: 2, objectCode: 'MOOE', obligationMonth: '2023-06-20', disbursementMonth: '2023-07-05', amount: 25000 }] },
    { id: 5, component: 'Social Preparation', name: 'IPO Registration Drive (RSBSA, SEC, DOLE, CDA)', date: '2022-01-15', description: 'Assisted unregistered IPOs with their registration requirements.', location: 'Brgy. Poblacion, Lake Sebu, South Cotabato', participatingIpos: ['Lake Sebu T\'boli Weavers Association'], participantsMale: 10, participantsFemale: 30, expenses: [{ id: 3, objectCode: 'MOOE', obligationMonth: '2022-01-10', disbursementMonth: '2022-01-25', amount: 40000 }] },
    { id: 6, component: 'Marketing and Enterprise', name: 'Trade and Promotional Activity', date: '2023-10-20', description: 'Showcased T\'nalak woven products at a national trade fair.', location: 'Manila', participatingIpos: ['Lake Sebu T\'boli Weavers Association'], participantsMale: 3, participantsFemale: 7, expenses: [{ id: 4, objectCode: 'CO', obligationMonth: '2023-09-15', disbursementMonth: '2023-10-10', amount: 150000 }] },
    { id: 7, component: 'Program Management', name: 'Planning and BEDS Preparation', date: '2023-11-10', description: 'Annual planning and BEDS preparation workshop.', location: 'Online', participatingIpos: [], participantsMale: 0, participantsFemale: 0, expenses: [{ id: 5, objectCode: 'MOOE', obligationMonth: '2023-11-01', disbursementMonth: '2023-11-15', amount: 18000 }] },
    { id: 8, component: 'Social Preparation', name: 'Meetings', date: '2024-02-05', description: 'Coordination meeting with LGU and NCIP for the proposed heirloom rice project.', location: 'Brgy. Batad, Banaue, Ifugao', participatingIpos: ['Ifugao Rice Terraces Farmers Guild'], participantsMale: 25, participantsFemale: 10, expenses: [{ id: 6, objectCode: 'PS', obligationMonth: '2024-02-01', disbursementMonth: '2024-02-10', amount: 12000 }] },
    { id: 9, component: 'Program Management', name: 'Sub-Project Monitoring', date: '2023-09-15', description: 'Site visit to monitor the progress of the abaca fiber project.', location: 'Brgy. Poonbato, Botolan, Zambales', participatingIpos: ['Zambales Aeta Abaca Growers Inc.'], participantsMale: 2, participantsFemale: 1, expenses: [{ id: 7, objectCode: 'MOOE', obligationMonth: '2023-09-01', disbursementMonth: '2023-09-20', amount: 22000 }] },
    { id: 10, component: 'Marketing and Enterprise', name: 'Market Linkaging', date: '2022-12-01', description: 'Connected seaweed farmers with export consolidators.', location: 'Island Garden City of Samal, Davao del Norte', participatingIpos: ['Samal Island Seaweeds Planters Org.'], participantsMale: 8, participantsFemale: 12, expenses: [{ id: 8, objectCode: 'MOOE', obligationMonth: '2022-11-20', disbursementMonth: '2022-12-05', amount: 35000 }] },
    { id: 11, component: 'Social Preparation', name: 'Orientation', date: '2023-03-20', description: 'Orientation on 4K program for new IPO members in Palawan.', location: 'Brgy. San Rafael, Puerto Princesa, Palawan', participatingIpos: ['Palawan Tagbanua Rattan Gatherers'], participantsMale: 30, participantsFemale: 5, expenses: [{ id: 9, objectCode: 'MOOE', obligationMonth: '2023-03-10', disbursementMonth: '2023-03-25', amount: 28000 }] },
    { id: 12, component: 'Program Management', name: 'Performance and Budget Utilization Review (PBUR)', date: '2024-01-15', description: 'Year-end review of all projects in Davao Region.', location: 'Davao City', participatingIpos: [], participantsMale: 0, participantsFemale: 0, expenses: [{ id: 10, objectCode: 'MOOE', obligationMonth: '2024-01-05', disbursementMonth: '2024-01-20', amount: 55000 }] },
    { id: 13, component: 'Social Preparation', name: 'Profiling', date: '2021-06-10', description: 'Socio-economic profiling of Aeta communities for project planning.', location: 'Brgy. Poonbato, Botolan, Zambales', participatingIpos: ['Zambales Aeta Abaca Growers Inc.'], participantsMale: 15, participantsFemale: 20, expenses: [{ id: 11, objectCode: 'PS', obligationMonth: '2021-06-01', disbursementMonth: '2021-06-15', amount: 19000 }] },
    { id: 14, component: 'Marketing and Enterprise', name: 'Trade and Promotional Activity', date: '2023-07-25', description: 'Participation in the Regional Agri-Aqua Fair.', location: 'Tagbilaran City', participatingIpos: ['Tawi-Tawi Bajau Seaweed Farmers'], participantsMale: 4, participantsFemale: 6, expenses: [{ id: 12, objectCode: 'CO', obligationMonth: '2023-07-01', disbursementMonth: '2023-07-15', amount: 75000 }] },
    { id: 15, component: 'Program Management', name: 'Sub-Project Monitoring', date: '2024-04-02', description: 'Monitoring visit for the T\'nalak Weaving Center construction.', location: 'Brgy. Poblacion, Lake Sebu, South Cotabato', participatingIpos: ['Lake Sebu T\'boli Weavers Association'], participantsMale: 1, participantsFemale: 1, expenses: [{ id: 13, objectCode: 'MOOE', obligationMonth: '2024-03-20', disbursementMonth: '2024-04-10', amount: 31000 }] }
];


const App: React.FC = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState('/');
    const [selectedIpo, setSelectedIpo] = useState<IPO | null>(null);
    const [selectedSubproject, setSelectedSubproject] = useState<Subproject | null>(null);
    const [previousPage, setPreviousPage] = useState<string | null>(null);
    
    const [ipos, setIpos] = useState<IPO[]>(initialIpos);
    const [subprojects, setSubprojects] = useState<Subproject[]>(initialSubprojects);
    const [trainings, setTrainings] = useState<Training[]>(initialTrainings);
    const [otherActivities, setOtherActivities] = useState<OtherActivity[]>(initialOtherActivities);

    useEffect(() => {
        const isDark = localStorage.getItem('isDarkMode') === 'true';
        setIsDarkMode(isDark);
    }, []);

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('isDarkMode', 'true');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('isDarkMode', 'false');
        }
    }, [isDarkMode]);

    const toggleDarkMode = () => {
        setIsDarkMode(prev => !prev);
    };

    const toggleSidebar = () => {
        setIsSidebarOpen(prev => !prev);
    };
    
    const handleNavigation = (page: string) => {
        setSelectedIpo(null);
        setSelectedSubproject(null);
        setPreviousPage(null);
        setCurrentPage(page);
    };
    
    const handleSelectIpo = (ipo: IPO) => {
        setPreviousPage(currentPage);
        setSelectedSubproject(null);
        setSelectedIpo(ipo);
    };

    const handleBackFromIpoDetail = () => {
        setSelectedIpo(null);
        if (previousPage) {
            setCurrentPage(previousPage);
        } else {
            setCurrentPage('/ipo'); // Fallback
        }
        setPreviousPage(null);
    };

    const handleSelectSubproject = (subproject: Subproject) => {
        setPreviousPage(currentPage);
        setSelectedIpo(null); // Ensure only one detail view is active
        setSelectedSubproject(subproject);
    };

    const handleBackFromSubprojectDetail = () => {
        const subprojectBeingViewed = selectedSubproject;
        setSelectedSubproject(null);

        if (previousPage) {
            // If we came from an IPO detail page, we need to restore it
            if (previousPage.startsWith('/ipo')) {
                 const originalIpo = ipos.find(i => i.name === subprojectBeingViewed?.indigenousPeopleOrganization);
                if (originalIpo) {
                    setSelectedIpo(originalIpo);
                    setCurrentPage(previousPage);
                } else {
                    // Fallback if IPO not found, just go to the previous page URL.
                    setCurrentPage(previousPage);
                }
            } else {
                // Otherwise, just navigate to the previous page URL (e.g., /subprojects)
                setCurrentPage(previousPage);
            }
        } else {
            // Fallback if no previous page is set.
            setCurrentPage('/subprojects');
        }
        setPreviousPage(null);
    };

    const handleUpdateIpo = (updatedIpo: IPO) => {
        setIpos(prevIpos => {
            const originalIpo = prevIpos.find(i => i.id === updatedIpo.id);
            if (!originalIpo) {
                return prevIpos;
            }

            const newHistoryEntries: HistoryEntry[] = [];
            const currentDate = new Date().toISOString().split('T')[0];
            const currentUser = 'System'; // Placeholder for current user

            if (originalIpo.levelOfDevelopment !== updatedIpo.levelOfDevelopment) {
                newHistoryEntries.push({
                    date: currentDate,
                    user: currentUser,
                    event: `Level of Development updated from ${originalIpo.levelOfDevelopment} to ${updatedIpo.levelOfDevelopment}.`
                });
            }
            if (originalIpo.name !== updatedIpo.name) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Name changed to "${updatedIpo.name}".` });
            }
            if (originalIpo.contactPerson !== updatedIpo.contactPerson) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Contact person changed to "${updatedIpo.contactPerson}".` });
            }
            if (originalIpo.location !== updatedIpo.location) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Location updated to "${updatedIpo.location}".` });
            }
            if (JSON.stringify(originalIpo.commodities) !== JSON.stringify(updatedIpo.commodities)) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Commodities list was updated.` });
            }

            if (newHistoryEntries.length > 0) {
                const ipoWithNewHistory = {
                    ...updatedIpo,
                    history: [...newHistoryEntries, ...(updatedIpo.history || [])],
                };
                setSelectedIpo(ipoWithNewHistory);
                return prevIpos.map(i => (i.id === ipoWithNewHistory.id ? ipoWithNewHistory : i));
            }
            
            setSelectedIpo(updatedIpo);
            return prevIpos.map(i => (i.id === updatedIpo.id ? updatedIpo : i));
        });
    };
    
     const handleUpdateSubproject = (updatedSubproject: Subproject) => {
        setSubprojects(prevSubprojects => {
            const originalSubproject = prevSubprojects.find(p => p.id === updatedSubproject.id);
            if (!originalSubproject) {
                return prevSubprojects;
            }

            const newHistoryEntries: HistoryEntry[] = [];
            const currentDate = new Date().toISOString().split('T')[0];
            const currentUser = 'System'; // Placeholder

            const finalUpdatedSubproject = { ...updatedSubproject };

            if (originalSubproject.status !== finalUpdatedSubproject.status) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Status updated from '${originalSubproject.status}' to '${finalUpdatedSubproject.status}'.`});
                
                if (finalUpdatedSubproject.status === 'Completed' && !finalUpdatedSubproject.actualCompletionDate) {
                    finalUpdatedSubproject.actualCompletionDate = currentDate;
                    newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Project marked as completed. Completion date set to ${currentDate}.` });
                } else if (originalSubproject.status === 'Completed' && finalUpdatedSubproject.status !== 'Completed') {
                    finalUpdatedSubproject.actualCompletionDate = '';
                     newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Project status changed from 'Completed'. Completion date has been cleared.` });
                }
            }

            if (originalSubproject.remarks !== finalUpdatedSubproject.remarks) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Remarks were updated.`});
            }
             if (JSON.stringify(originalSubproject.details) !== JSON.stringify(finalUpdatedSubproject.details)) {
                newHistoryEntries.push({ date: currentDate, user: currentUser, event: `Project details were updated.` });
            }

            if (newHistoryEntries.length > 0) {
                const projectWithHistory = {
                    ...finalUpdatedSubproject,
                    history: [...newHistoryEntries, ...(finalUpdatedSubproject.history || [])],
                };
                setSelectedSubproject(projectWithHistory);
                return prevSubprojects.map(p => (p.id === projectWithHistory.id ? projectWithHistory : p));
            }
            
            setSelectedSubproject(finalUpdatedSubproject);
            return prevSubprojects.map(p => (p.id === finalUpdatedSubproject.id ? finalUpdatedSubproject : p));
        });
    };

    const getPageName = (path: string | null): string => {
        switch(path) {
            case '/dashboards': return 'Dashboard';
            case '/subprojects': return 'Subprojects';
            case '/trainings': return 'Trainings';
            case '/ipo': return 'IPO List';
            case '/other-activities': return 'Other Activities';
            default: return 'IPO List';
        }
    }

    const renderPage = () => {
        switch (currentPage) {
            case '/':
                return <Dashboard 
                            subprojects={subprojects}
                            ipos={ipos}
                            trainings={trainings}
                            otherActivities={otherActivities}
                        />;
            case '/dashboards':
                return <DashboardsPage
                            subprojects={subprojects}
                            ipos={ipos}
                            trainings={trainings}
                            otherActivities={otherActivities}
                        />;
            case '/subprojects':
                return <Subprojects ipos={ipos} subprojects={subprojects} setSubprojects={setSubprojects} onSelectIpo={handleSelectIpo} onSelectSubproject={handleSelectSubproject}/>;
            case '/ipo':
                return <IPOs 
                    ipos={ipos} 
                    setIpos={setIpos} 
                    subprojects={subprojects} 
                    trainings={trainings} 
                    onSelectIpo={handleSelectIpo}
                    onSelectSubproject={handleSelectSubproject}
                />;
            case '/trainings':
                return <TrainingsComponent ipos={ipos} trainings={trainings} setTrainings={setTrainings} onSelectIpo={handleSelectIpo} />;
            case '/other-activities':
                return <OtherActivitiesComponent ipos={ipos} otherActivities={otherActivities} setOtherActivities={setOtherActivities} onSelectIpo={handleSelectIpo} />;
            default:
                return (
                    <div className="text-center p-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Page Coming Soon!</h2>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">This section is under construction.</p>
                    </div>
                );
        }
    };
    
    const renderDetailView = () => {
        if (selectedSubproject) {
            return <SubprojectDetail 
                subproject={selectedSubproject}
                onBack={handleBackFromSubprojectDetail}
                previousPageName={getPageName(previousPage)}
                onUpdateSubproject={handleUpdateSubproject}
            />;
        }
        if (selectedIpo) {
            return <IPODetail 
                ipo={selectedIpo}
                subprojects={subprojects.filter(p => p.indigenousPeopleOrganization === selectedIpo.name)}
                trainings={trainings.filter(t => t.participatingIpos.includes(selectedIpo.name))}
                onBack={handleBackFromIpoDetail}
                previousPageName={getPageName(previousPage)}
                onUpdateIpo={handleUpdateIpo}
                onSelectSubproject={handleSelectSubproject}
            />;
        }
        return renderPage();
    }

    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
            <Sidebar 
                isOpen={isSidebarOpen} 
                closeSidebar={() => setIsSidebarOpen(false)}
                currentPage={currentPage}
                setCurrentPage={handleNavigation} 
            />
            
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    toggleSidebar={toggleSidebar} 
                    toggleDarkMode={toggleDarkMode} 
                    isDarkMode={isDarkMode} 
                />
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 lg:p-8">
                    {renderDetailView()}
                </main>
                <footer className="text-center p-4 text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                    System maintained by the DA 4K NPMO
                </footer>
            </div>
        </div>
    );
};

export default App;
