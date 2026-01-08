/**
 * USER PROFILE SERVICE
 * Sprint 5: Persistent user data storage
 * Remembers users across sessions
 */
import * as fs from 'fs';
import * as path from 'path';
const PROFILES_DIR = path.join(process.cwd(), 'data', 'profiles');
class UserProfileService {
    constructor() {
        this.ensureDir();
    }
    ensureDir() {
        if (!fs.existsSync(PROFILES_DIR)) {
            fs.mkdirSync(PROFILES_DIR, { recursive: true });
            console.log(`[UserProfile] Created profiles directory: ${PROFILES_DIR}`);
        }
    }
    getFilePath(sessionId) {
        return path.join(PROFILES_DIR, `${sessionId}.json`);
    }
    /**
     * Get or create user profile
     */
    async getProfile(sessionId) {
        const filePath = this.getFilePath(sessionId);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf-8');
                const profile = JSON.parse(data);
                // Update for this visit
                profile.visitCount++;
                profile.lastSeen = Date.now();
                profile.isReturningUser = true;
                await this.saveProfile(profile);
                console.log(`[UserProfile] Returning user: ${sessionId} (visit #${profile.visitCount})`);
                return profile;
            }
        }
        catch (error) {
            console.error(`[UserProfile] Failed to load profile:`, error);
        }
        // Create new profile
        const newProfile = {
            sessionId,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            visitCount: 1,
            interests: [],
            flags: { curious: 0, cautious: 0, goal_oriented: 0 },
            isReturningUser: false,
            introComplete: false,
            keyFacts: []
        };
        await this.saveProfile(newProfile);
        console.log(`[UserProfile] New user: ${sessionId}`);
        return newProfile;
    }
    /**
     * Save profile to disk
     */
    async saveProfile(profile) {
        const filePath = this.getFilePath(profile.sessionId);
        try {
            fs.writeFileSync(filePath, JSON.stringify(profile, null, 2));
        }
        catch (error) {
            console.error(`[UserProfile] Failed to save profile:`, error);
        }
    }
    /**
     * Mark intro as complete
     */
    async markIntroComplete(sessionId) {
        const profile = await this.getProfile(sessionId);
        profile.introComplete = true;
        await this.saveProfile(profile);
    }
    /**
     * Add a key fact about the user
     */
    async addKeyFact(sessionId, fact) {
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
    async setName(sessionId, name) {
        const profile = await this.getProfile(sessionId);
        profile.name = name;
        await this.saveProfile(profile);
        console.log(`[UserProfile] Set name: ${name}`);
    }
    /**
     * Update geo data
     */
    async setGeoData(sessionId, geoData) {
        const profile = await this.getProfile(sessionId);
        profile.geoData = geoData;
        await this.saveProfile(profile);
    }
    /**
     * Update flags
     */
    async updateFlags(sessionId, flags) {
        const profile = await this.getProfile(sessionId);
        profile.flags = { ...profile.flags, ...flags };
        await this.saveProfile(profile);
    }
    /**
     * Get memory context for LLM
     */
    async getMemoryContext(sessionId) {
        const profile = await this.getProfile(sessionId);
        const parts = [];
        if (profile.isReturningUser) {
            parts.push(`RETURNING USER (visit #${profile.visitCount})`);
            if (profile.name) {
                parts.push(`Name: ${profile.name}`);
            }
        }
        else {
            parts.push('NEW USER (first visit)');
        }
        if (profile.geoData?.city && profile.geoData.city !== 'Unknown') {
            parts.push(`Location: ${profile.geoData.city}, ${profile.geoData.country}`);
        }
        if (profile.keyFacts.length > 0) {
            parts.push(`Known facts: ${profile.keyFacts.slice(-5).join('; ')}`);
        }
        parts.push(`Traits: Curious(${profile.flags.curious}), Cautious(${profile.flags.cautious}), Goal(${profile.flags.goal_oriented})`);
        return parts.join('\n');
    }
}
export const userProfile = new UserProfileService();
