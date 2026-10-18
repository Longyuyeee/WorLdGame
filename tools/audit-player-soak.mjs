import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {validatePlayerPressure} from './audit-player-pressure.mjs';
import {summarizePlayerSoak} from './player-soak-report.mjs';
export const validatePlayerSoak = evidence => validatePlayerPressure(evidence,{naturalGc:true});
export async function auditPlayerSoak(root){const evidence=JSON.parse(await readFile(join(root,'evidence/authoring/player-soak.json'),'utf8'));return {...validatePlayerSoak(evidence),summary:summarizePlayerSoak(evidence)};}
