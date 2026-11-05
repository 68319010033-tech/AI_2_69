import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { baseParse } from '@vue/compiler-dom'
import { message, setLocale, t, importNotice } from '../src/i18n.js'

test('English mode covers static Thai interface labels across all pages and dialogs', () => {
    setLocale('en')
    const missing = []
    for (const folder of ['views', 'components']) {
        const dir = new URL(`../src/${folder}/`, import.meta.url)
        for (const file of readdirSync(dir).filter(name => name.endsWith('.vue'))) {
            const source = readFileSync(new URL(file, dir), 'utf8')
            const template = parse(source).descriptor.template.content
            const report = label => missing.push(`${file}: ${label}`)
            function visit(node) {
                if (node.type === 2 && /[ก-๙]/u.test(node.content)) report(node.content.trim())
                for (const prop of node.props || []) {
                    if (['title', 'placeholder', 'aria-label'].includes(prop.name) && /[ก-๙]/u.test(prop.value?.content || '')) report(prop.value.content)
                }
                for (const child of node.children || []) visit(child)
            }
            visit(baseParse(template))
            for (const match of template.matchAll(/\b(?:t|tr|copy)\((['"])([^'"\n]+)\1\)/gu)) {
                if (/[ก-๙]/u.test(t(match[2]))) report(match[2])
            }
        }
    }
    assert.deepEqual(missing, [])
})

test('live progress and import messages switch language without translating dataset values', () => {
    const key = 'ปรับตารางให้ลงตัวขึ้น: {before} → {after}'
    setLocale('en')
    assert.equal(message(key, { before: 20, after: 10 }), 'Improved the timetable: 20 → 10')
    assert.equal(importNotice('ห้อง.csv: ไฟล์ต้องมีขนาดไม่เกิน 10 MB'), 'ห้อง.csv: File must be 10 MB or smaller')
    setLocale('th')
    assert.match(message(key, { before: 20, after: 10 }), /^ปรับตาราง/)
})
