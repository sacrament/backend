const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FaqItemSchema = new Schema({
    question: { type: String, required: true },
    answer:   { type: String, required: true }
}, { _id: false });

const FaqCategorySchema = new Schema({
    category: { type: String, required: true },
    items:    { type: [FaqItemSchema], default: [] }
}, { _id: false });

const SectionSchema = new Schema({
    number: { type: String, default: null },
    title:  { type: String, default: null },
    body:   { type: String, required: true }
}, { _id: false });

const DocumentSchema = new Schema({
    lastUpdated: { type: String, default: null },
    sections:    { type: [SectionSchema], default: [] }
}, { _id: false });

const RuleCardSchema = new Schema({
    icon:      { type: String, required: true },
    iconColor: { type: String, required: true },
    title:     { type: String, required: true },
    rules:     { type: [String], default: [] }
}, { _id: false });

// One document per type: 'faq' | 'privacyPolicy' | 'termsOfService' | 'winkyRules'
const LegalContentSchema = new Schema({
    type:        { type: String, enum: ['faq', 'privacyPolicy', 'termsOfService', 'winkyRules'], required: true, unique: true },
    lastUpdated: { type: String, required: true },
    // faq only
    categories:  { type: [FaqCategorySchema], default: undefined },
    // privacyPolicy / termsOfService only
    sections:    { type: [SectionSchema], default: undefined },
    // winkyRules only
    tagline:     { type: String, default: undefined },
    cards:       { type: [RuleCardSchema], default: undefined }
}, { timestamps: true });

mongoose.model('LegalContent', LegalContentSchema);
