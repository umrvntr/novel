/**
 * USER PROFILE SERVICE
 * Sprint 5: Persistent user data storage
 * Remembers users across sessions
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GeoData } from './geoService.js';

const PROFILES_DIR = path.join(process.cwd(), 'data', 'profiles');

export interface UserFlags {
    curious: number;
    cautious: number;
    goal_oriented: number;
}

export interface UserProfile {
    sessionId: string;
    firstSeen: number;
    lastSeen: number;
    visitCount: number;
    name?: string;
    interests: string[];
    flags: UserFlags;
    geoData?: GeoData;
    isReturningUser: boolean;
    introComplete: boolean;
    keyFacts: string[];  // "User likes cyberpunk", "User is from Madrid"
    currentMood: string; // V8's persistent mood
}

class UserProfileService {
    constructor() {
        this.ensureDir();
    }

    private ensureDir(): void {
        if (!fs.existsSync(PROFILES_DIR)) {
            fs.mkdirSync(PROFILES_DIR, { recursive: true });
            console.log(`[UserProfile] Created profiles directory: ${PROFILES_DIR}`);
        }
    }

    private getFilePath(sessionId: string): string {
        return path.join(PROFILES_DIR, `${sessionId}.json`);
    }

    /**
     * Get or create user profile
     */
    async getProfile(sessionId: string): Promise<UserProfile> {
        const filePath = this.getFilePath(sessionId);

        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                const profile = JSON.parse(data) as UserProfile;

                // Update for this visit
                profile.visitCount++;
                profile.lastSeen = Date.now();
                profile.isReturningUser = true;

                await this.saveProfile(profile);
                console.log(`[UserProfile] Returning user: ${sessionId} (visit #${profile.visitCount})`);
                return profile;
            }
        } catch (error) {
            console.error(`[UserProfile] Failed to load profile:`, error);
        }

        // Create new profile
        const newProfile: UserProfile = {
            sessionId,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            visitCount: 1,
            interests: [],
            flags: { curious: 0, cautious: 0, goal_oriented: 0 },
            isReturningUser: false,
            introComplete: false,
            keyFacts: [],
            currentMood: 'neutral'
        };

        await this.saveProfile(newProfile);
        console.log(`[UserProfile] New user: ${sessionId}`);
        return newProfile;
    }

    /**
     * Save profile to disk
     */
    async saveProfile(profile: UserProfile): Promise<void> {
        const filePath = this.getFilePath(profile.sessionId);
        try {
            fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
        } catch (error) {
            console.error(`[UserProfile] Failed to save profile:`, error);
        }
    }

    /**
     * Mark intro as complete
     */
    async markIntroComplete(sessionId: string): Promise<void> {
        const profile = await this.getProfile(sessionId);
        profile.introComplete = true;
        await this.saveProfile(profile);
    }

    /**
     * Add a key fact about the user
     */
    async addKeyFact(sessionId: string, fact: string): Promise<void> {
        const profile = await this.getProfile(sessionId);
        if (!profile.keyFacts.includes(fact)) {
            profile.keyFacts.push(fact);
            // Keep only last 20 facts
            if (profile.keyFacts.length > 20) {
                profile.keyFacts = profile.keyFacts.slice(-20);
            }
            await this.saveProfile(profile);
            console.log(`[UserProfile] Added fact: ${fact}`);
        }
    }

    /**
     * Set user's name
     */
    async setName(sessionId: string, name: string): Promise<void> {
        const profile = await this.getProfile(sessionId);
        profile.name = name;
        await this.saveProfile(profile);
        console.log(`[UserProfile] Set name: ${name}`);
    }

    /**
     * Set V8's current mood
     */
    async setMood(sessionId: string, mood: string): Promise<void> {
        const profile = await this.getProfile(sessionId);
        profile.currentMood = mood;
        await this.saveProfile(profile);
        console.log(`[UserProfile] Set mood: ${mood}`);
    }

    /**
     * Update geo data
     */
    async setGeoData(sessionId: string, geoData: GeoData): Promise<void> {
        const profile = await this.getProfile(sessionId);
        profile.geoData = geoData;
        await this.saveProfile(profile);
    }

    /**
     * Update flags
     */
    async updateFlags(sessionId: string, flags: Partial<UserFlags>): Promise<void> {
        const profile = await this.getProfile(sessionId);
        profile.flags = { ...profile.flags, ...flags };
        await this.saveProfile(profile);
    }

    /**
     * Get memory context for LLM
     */
    async getMemoryContext(sessionId: string): Promise<string> {
        const profile = await this.getProfile(sessionId);

        const parts: string[] = [];

        if (profile.isReturningUser) {
            parts.push(`RETURNING USER (visit #${profile.visitCount})`);
            if (profile.name) {
                parts.push(`Name: ${profile.name}`);
            }
        } else {
            parts.push('NEW USER (first visit)');
        }

        if (profile.geoData?.city && profile.geoData.city !== 'Unknown') {
            parts.push(`Location: ${profile.geoData.city}, ${profile.geoData.country}`);
        }

        if (profile.keyFacts.length > 0) {
            parts.push(`Known facts: ${profile.keyFacts.slice(-5).join('; ')}`);
        }

        parts.push(`Current Mood: ${profile.currentMood || 'neutral'}`);

        parts.push(`Traits: Curious(${profile.flags.curious}), Cautious(${profile.flags.cautious}), Goal(${profile.flags.goal_oriented})`);

        return parts.join('\n');
    }
}

export const userProfile = new UserProfileService();
