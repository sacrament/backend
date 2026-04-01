/**
 * Seed script — Legal Content (FAQ, Privacy Policy, Terms of Service)
 * Run once: node server/scripts/seed.legal.content.js
 * Safe to re-run: uses upsert so it won't duplicate documents.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });
const mongoose = require('mongoose');
require('../models/legal.content');

const LegalContent = mongoose.model('LegalContent');

const LAST_UPDATED = '2026-03-24';

const seeds = [
    {
        type: 'faq',
        lastUpdated: LAST_UPDATED,
        categories: [
            {
                category: 'ABOUT WINKY',
                items: [
                    { question: 'What is WINKY?',                      answer: 'WINKY is a real-time proximity-based social app that allows individuals to safely connect with others who are physically nearby — without public profiles, swiping mechanics, or sharing personal contact information.' },
                    { question: "What is WINKY's slogan?",              answer: 'Flirt nearby. Stay private.' },
                    { question: "What is WINKY's mission?",             answer: "WINKY's mission is to make flirting feel natural, local, and secure — by enabling real-time connections without pressure, public exposure, or unnecessary sharing of personal data." },
                    { question: 'Where can I download WINKY?',          answer: 'WINKY is available on the Apple App Store and Google Play Store.' },
                    { question: 'Is WINKY free?',                       answer: 'WINKY is free to download and use. Optional premium features may be introduced in future versions. Any paid features will be clearly disclosed before purchase.' },
                    { question: 'How do I sign up?',                    answer: 'You may register using your mobile phone number. A verification code will be sent to confirm your identity. Your phone number is used solely for verification and security purposes and is not displayed to other users.' },
                    { question: 'What is the maximum connection distance?', answer: 'Users may adjust the radar distance slider to connect with other WINKY users between approximately 75 feet and ½ mile.' }
                ]
            },
            {
                category: 'PRIVACY & SECURITY',
                items: [
                    { question: 'How old do I have to be to use WINKY?',       answer: 'You must be at least 18 years old to create and use a WINKY account.' },
                    { question: 'How does WINKY protect my privacy?',          answer: 'WINKY allows users to connect and communicate without revealing personal contact information such as phone numbers, email addresses, or social media accounts.' },
                    { question: 'Are my conversations private?',               answer: 'Yes. Messages are protected using end-to-end encryption. WINKY does not sell user messages and does not share private conversations with third parties, except as required by law or as described in the Privacy Policy.' },
                    { question: 'Does WINKY display my exact location?',       answer: 'WINKY uses proximity-based technology to identify nearby users. Your precise GPS coordinates are not displayed to other users.' },
                    { question: 'Can other users see my phone number?',        answer: 'No. Your phone number is used only for account verification and is never displayed to other users.' },
                    { question: 'How do I report inappropriate behavior?',     answer: "Open the conversation, tap the three dots in the top-right corner, and select 'Block & Report.' WINKY maintains a zero-tolerance policy for harassment, abuse, or inappropriate conduct." },
                    { question: 'What happens if someone behaves inappropriately?', answer: 'WINKY has a zero-tolerance policy for harassment, abuse, or inappropriate conduct. Users who violate our Terms may be suspended or permanently banned.' }
                ]
            },
            {
                category: 'SPARKS',
                items: [
                    { question: 'What is the SPARKS section?',                          answer: 'The SPARKS section displays the most recent users you have crossed paths with or connected with.' },
                    { question: 'How many connections are saved in SPARKS?',            answer: 'SPARKS stores your most recent 100 connections.' },
                    { question: 'If I delete someone from SPARKS, am I removed from theirs?', answer: 'No. Deleting someone from your SPARKS removes them only from your list. To prevent further communication, you must block the user.' }
                ]
            },
            {
                category: 'GROUP CHATS',
                items: [
                    { question: 'Does WINKY support group chats?', answer: 'WINKY currently supports one-on-one conversations only. Group chat functionality may be introduced in a future update.' }
                ]
            },
            {
                category: 'BLUETOOTH MODE',
                items: [
                    { question: 'How do I enable Bluetooth mode?',                answer: 'Navigate to Settings and enable the Bluetooth toggle.' },
                    { question: 'When should I use Bluetooth mode?',              answer: 'Bluetooth mode is recommended in areas where mobile data or Wi-Fi is unavailable.' },
                    { question: "Why can't I see other users while in Bluetooth mode?", answer: 'Both users must be in Bluetooth mode to discover each other. Bluetooth and GPS modes do not interact.' }
                ]
            },
            {
                category: 'INVISIBLE MODE',
                items: [
                    { question: 'How do I become invisible?',              answer: 'Enable Invisible Mode in Settings. When activated, other users will not see you on their radar.' },
                    { question: 'If I am invisible, can I still see others?', answer: 'Yes. Invisible Mode hides you from others but does not restrict your ability to view nearby users.' }
                ]
            },
            {
                category: 'ACCOUNT MANAGEMENT',
                items: [
                    { question: 'Can I change my username?',   answer: 'Yes. You may edit your username in the Profile section.' },
                    { question: 'How do I delete my account?', answer: 'You may permanently delete your account at any time in the Settings section. Account deletion removes your profile and chat history from active systems in accordance with the Privacy Policy.' },
                    { question: 'How do I unblock someone?',   answer: "Go to your chat history, tap the three dots in the top-right corner, and select 'Unblock.'" }
                ]
            },
            {
                category: 'TROUBLESHOOTING',
                items: [
                    { question: "Why don't I see anyone nearby?", answer: 'This could be due to location permissions being disabled, Bluetooth being off, no active users within your selected range, or a weak network connection. Check your settings and make sure you are in an area with other active WINKY users.' }
                ]
            }
        ]
    },
    {
        type: 'privacyPolicy',
        lastUpdated: LAST_UPDATED,
        sections: [
            { number: null, title: null,                                  body: 'This Privacy Policy explains how Life on Queen Inc. ("WINKY," "we," "us," or "our") collects, uses, discloses, and safeguards your information when you use the WINKY mobile application (the "Service"). This Privacy Policy should be read together with our Terms of Service.' },
            { number: '1',  title: 'Eligibility and Age Restriction',     body: 'WINKY is strictly for individuals 18 years of age or older. We do not knowingly collect personal information from anyone under 18. If we become aware that a minor has registered, we will immediately terminate the account and delete associated data.' },
            { number: '2',  title: 'Information We Collect',              body: 'We may collect personal information you provide directly, including name, email address, phone number, date of birth, gender, profile photos, videos, and account credentials. We also collect device information, IP address, operating system, app version, usage activity, and diagnostic data.' },
            { number: '3',  title: 'Location Data',                       body: 'With your permission, we collect approximate geolocation data to power the Nearby radar feature. We do not display exact GPS coordinates to other users. Location access may be disabled in your device settings, though certain features may not function properly.' },
            { number: '4',  title: 'End-to-End Encrypted Communications', body: 'Private messages, voice calls, and video calls are protected using end-to-end encryption. Messages are encrypted on your device and decrypted only by the intended recipient. WINKY cannot access the content of encrypted communications except if reported by a user or required by law. We may retain limited metadata (such as timestamps and user identifiers) to operate and secure the Service.' },
            { number: '5',  title: 'Media and Device Permissions',        body: 'With your permission, WINKY may access your camera, microphone, and photo library to allow you to capture and share media within the app. You may revoke these permissions through your device settings at any time.' },
            { number: '6',  title: 'How We Use Your Information',         body: 'We use your information to operate, maintain, and improve WINKY; enable location-based matching; facilitate encrypted communications; provide customer support; enforce our Terms of Service; detect fraud; and comply with legal obligations.' },
            { number: '7',  title: 'Sharing of Information',              body: 'We do not sell your personal information. We may share information with trusted service providers for hosting, analytics, and infrastructure support; to comply with legal obligations; to protect users and enforce policies; or in connection with a business transfer such as a merger or acquisition.' },
            { number: '8',  title: 'Data Retention',                      body: 'We retain personal data for as long as your account remains active or as necessary to comply with legal obligations and resolve disputes. Upon account deletion, we will delete or anonymize personal information unless retention is legally required.' },
            { number: '9',  title: 'Security Measures',                   body: 'We implement commercially reasonable safeguards, including secure servers, access controls, and encryption technologies. While we strive to protect your data, no system is completely secure.' },
            { number: '10', title: 'Your Privacy Rights',                 body: 'Depending on your jurisdiction, you may have rights to access, correct, delete, or restrict processing of your personal data. You may exercise these rights by contacting info@winky.com.' },
            { number: '11', title: 'International Data Transfers',        body: 'Your information may be processed and stored in the United States or other jurisdictions where we operate. By using WINKY, you consent to such transfers.' },
            { number: '12', title: 'Apple App Store Compliance',          body: "If you download WINKY from the Apple App Store, Apple Inc. is not responsible for our privacy practices. Our collection and use of personal information complies with Apple's App Store Review Guidelines and applicable data protection laws. Any data collected directly by Apple is governed by Apple's own Privacy Policy." },
            { number: '13', title: 'Changes to This Privacy Policy',      body: 'We may update this Privacy Policy from time to time. Material changes will be communicated via in-app notice or updated effective date. Continued use of WINKY constitutes acceptance of the revised policy.' },
            { number: '14', title: 'Contact Information',                 body: 'Life on Queen Inc.\nMiami, Florida\nEmail: info@winky.com' }
        ]
    },
    {
        type: 'winkyRules',
        lastUpdated: LAST_UPDATED,
        tagline: 'WINKY is built on respect and safety',
        cards: [
            {
                icon: 'hand.raised.fill',
                iconColor: 'pink',
                title: 'Consent First',
                rules: [
                    'No unsolicited calls or video calls',
                    'Messaging before calling is mandatory'
                ]
            },
            {
                icon: 'clock.fill',
                iconColor: 'orange',
                title: 'Temporary Visibility',
                rules: [
                    'User presence expires',
                    'No long-term tracking or stalking'
                ]
            },
            {
                icon: 'person.fill.checkmark',
                iconColor: 'blue',
                title: 'User Control',
                rules: [
                    'Users can block, mute, or disappear instantly',
                    'No explanation required'
                ]
            },
            {
                icon: 'exclamationmark.triangle.fill',
                iconColor: 'red',
                title: 'Zero Tolerance',
                rules: [
                    'Harassment = immediate restriction or removal',
                    'Repeat behavior = permanent ban'
                ]
            },
            {
                icon: 'shield.fill',
                iconColor: 'green',
                title: 'No Outside Pressure',
                rules: [
                    'Do not encourage sharing phone numbers or social media',
                    'WINKY is a bridge, not a data collector'
                ]
            }
        ]
    },
    {
        type: 'termsOfService',
        lastUpdated: LAST_UPDATED,
        sections: [
            { number: null,  title: null,                          body: 'These Terms of Service ("Terms") govern your access to and use of the WINKY mobile application (the "App" or "Service"), owned and operated by Life on Queen Inc. ("WINKY," "we," "us," or "our"). By downloading, accessing, or using WINKY, you agree to be bound by these Terms. If you do not agree, you may not use the Service.' },
            { number: '1',   title: 'Eligibility',                 body: 'You must be at least 18 years old to use WINKY. By using the Service, you represent that you are 18 years of age or older and have the legal capacity to enter into this agreement. We reserve the right to request age verification and suspend or terminate accounts that violate this requirement.' },
            { number: '2',   title: 'Nature of the Service',       body: 'WINKY is a location-based social discovery platform allowing users to discover others nearby, exchange messages, and engage in audio or video communication. WINKY does not conduct criminal background checks and does not guarantee the accuracy of user profiles. You are solely responsible for your interactions with other users, both online and offline.' },
            { number: '3',   title: 'Account Registration',        body: 'You agree to provide accurate information and maintain the confidentiality of your login credentials. You may not impersonate others or create accounts for unlawful or abusive purposes. We reserve the right to suspend or terminate accounts at our sole discretion.' },
            { number: '4',   title: 'Location Services',           body: 'WINKY uses geolocation data to power its Nearby radar feature. By using the Service, you consent to the collection and display of approximate location information. Precise GPS coordinates are not displayed to other users. Disabling location services may limit functionality.' },
            { number: '5',   title: 'End-to-End Encryption',       body: 'All user communications within WINKY, including messages, voice calls, and video calls, are protected using end-to-end encryption technology. This means that communications are encrypted on the sender\'s device and can only be decrypted by the intended recipient. WINKY cannot access or read the content of encrypted private communications except where content is reported by a user or required by law.' },
            { number: '6',   title: 'User Content',                body: 'You retain ownership of content you post. By posting content, you grant WINKY a non-exclusive, worldwide, royalty-free, transferable, sublicensable license to host, use, reproduce, display, and distribute such content for operating and promoting the Service. You may not post unlawful, abusive, defamatory, fraudulent, sexually exploitative, or otherwise objectionable material.' },
            { number: '7',   title: 'Prohibited Conduct',          body: 'You agree not to harass, threaten, impersonate, scam, solicit illegal services, use bots, reverse engineer the Service, or violate any laws. WINKY maintains zero tolerance for abusive or illegal conduct and may remove content and terminate accounts without notice.' },
            { number: '8',   title: 'Safety Disclaimer',           body: 'WINKY is a technology platform, not a matchmaking service. We are not responsible for user behavior, offline meetings, emotional distress, financial loss, or personal injury arising from interactions between users.' },
            { number: '9',   title: 'Payments and Subscriptions',  body: 'If premium services are offered, payments may be processed through Apple App Store or other platforms. Subscriptions automatically renew unless canceled in accordance with the applicable platform\'s policies. Refunds are subject to Apple App Store or Google Play policies where applicable.' },
            { number: '10',  title: 'Apple App Store Compliance',  body: 'If you download WINKY from the Apple App Store, you acknowledge that this agreement is between you and Life on Queen Inc., not Apple Inc. Apple is not responsible for the Service or its content. Apple has no obligation to furnish maintenance or support services. In the event of any failure of the Service to conform to an applicable warranty, you may notify Apple, and Apple may refund the purchase price if applicable. Apple is not responsible for addressing claims relating to the Service, including product liability, legal compliance, or intellectual property infringement claims. You agree to comply with all applicable third-party terms when using the Service.' },
            { number: '11',  title: 'Intellectual Property',       body: 'All trademarks, branding, software, and content owned by WINKY are protected by intellectual property laws. You may not use WINKY trademarks without written permission.' },
            { number: '12',  title: 'Termination',                 body: 'We may suspend or terminate accounts for violations of these Terms or harmful conduct. You may request account deletion by contacting info@winky.com. Certain provisions survive termination.' },
            { number: '13',  title: 'Disclaimer of Warranties',    body: 'The Service is provided on an \'AS IS\' and \'AS AVAILABLE\' basis without warranties of any kind, express or implied.' },
            { number: '14',  title: 'Limitation of Liability',     body: 'To the fullest extent permitted by law, WINKY shall not be liable for indirect, incidental, consequential, or punitive damages arising from use of the Service. Total liability shall not exceed the amount paid by you in the prior 12 months, if any.' },
            { number: '15',  title: 'Indemnification',             body: 'You agree to indemnify and hold harmless WINKY from claims arising from your use of the Service, your content, or your violation of these Terms.' },
            { number: '16',  title: 'Governing Law and Arbitration', body: 'These Terms are governed by the laws of the State of Florida. Any disputes shall be resolved by binding arbitration in Miami-Dade County, Florida. You waive the right to participate in class actions.' },
            { number: '17',  title: 'Changes to Terms',            body: 'We may modify these Terms at any time. Continued use of the Service constitutes acceptance of revised Terms.' },
            { number: '18',  title: 'Contact Information',         body: 'Life on Queen Inc.\nMiami-Dade County, Florida\nEmail: info@winky.com' }
        ]
    }
];

async function run() {
    await mongoose.connect(process.env.MONGO_HOST);
    console.log('Connected to MongoDB');

    for (const seed of seeds) {
        const { type, ...data } = seed;
        await LegalContent.findOneAndUpdate({ type }, { type, ...data }, { upsert: true, new: true });
        console.log(`✓ Upserted: ${type}`);
    }

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
