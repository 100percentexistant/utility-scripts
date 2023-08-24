import { default as ol } from "./index.mjs";

/*
WHAT IT DOES:
Loads the parent folder's main database (db.sqlite3)
Assigns to "b" the result of all users whose type is "2".
*/
var cmd = await ol(`
@~~join(., ../db.sqlite3)
b = ~(*)::users ? type == 2
`);

console.log(cmd.b);
