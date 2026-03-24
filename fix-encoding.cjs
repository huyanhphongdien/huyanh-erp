const fs = require('fs')
const files = [
  'src/pages/sales/CustomerListPage.tsx',
  'src/pages/sales/SalesOrderListPage.tsx'
]
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8')
  // Remove backslash before any non-ASCII character (Vietnamese diacritics)
  let fixed = ''
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\\' && i + 1 < content.length && content.charCodeAt(i + 1) > 127) {
      // Skip the backslash, keep the Vietnamese char
      continue
    }
    fixed += content[i]
  }
  if (fixed !== content) {
    fs.writeFileSync(f, fixed, 'utf8')
    const diff = content.length - fixed.length
    console.log(f + ': removed ' + diff + ' stray backslashes')
  } else {
    console.log(f + ': clean')
  }
})
