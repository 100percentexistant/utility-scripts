import * as fs from "fs";
import * as crypto from "crypto";
import { default as sqlite } from "sqlite3";
import * as path from 'path';
import {URL} from 'url';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

var sqlite3 = sqlite.verbose();

var sw = {
  "~": "SELECT",
  "!": "INSERT",
  "@": "UPDATE",
  "#": "DELETE",
  $: "CREATE",
  "%": "ALTER",
  "^": "DROP",
  "@": "CONNECT",
};

var replacements = {
  "!==": "!=",
  "==": "=",
  "<=": "<=",
  ">=": ">=",
  "<": "<",
  ">": ">",
  "&&": "AND",
  "||": "OR",
};

function parseFuncs(x) {
  if (/^~~(.*)\((.*)\)$/.test(x)) {
    var func = x.split("(")[0].split("~~")[1].trim();
    var args = x.split("(")[1].split(")").slice(0, -1).join(")").trim();
    switch (func) {
      case "md5":
        x = crypto.createHash("md5").update(args).digest("hex");
        break;
      case "base64":
        x = Buffer.from(args).toString("base64");
        break;
      case "sha256":
        x = crypto.createHash("sha256").update(args).digest("hex");
        break;
      default:
        x = func + "(" + args.trim() + ")";
        break;
    }
  }
  return x;
}

function parseWhere(x) {
  var oper = x.split("?").slice(1).join("?").split(" ").slice(1).join(" ");
  var sides = /^(.*)(!==|==|<=|>=|<|>|&&|\|\|)(.*)$/.exec(oper);
  var left = parseFuncs(sides[1].trim());
  var right = parseFuncs(sides[3].trim());
  var op = sides[2].trim();
  for (var x of Object.keys(replacements))
    if (op === x) {
      op = replacements[x];
      break;
    }
  var cmd = left + " " + op + " " + right;
  return cmd;
}

function parsePath(x) {
    var func = x.split("~~")[1].split("(")[0].trim();
    if (func) {
        var args = x.split("(").slice(1).join('(').split(")").slice(0, -1).join(')').trim().split(',').map(x => x.trim());
        for (var x of args) {
            if (args === ".") args = __dirname;
        }
        switch (func) {
            case "join":
                return path.join(...args);
                break;
        }
    }
}

function inferType(item) {
  if (parseInt(item) !== NaN) return parseInt(item);
  if (parseFloat(item) !== NaN) return parseFloat(item);
  if (item === "true" || item === "false") return item === "true" ? 1 : 0;
  return item;
}

export default async function (x1) {
  var db = null;
  var cmds = [];

  for (var x of x1.split("\n").map((x) => x.trim())) {
    if (x === "") continue;
    var name = x.split("=")[0].trim();
    x = x.split("=").slice(1).join("=").trim() || x;
    var op = sw[x[0]];
    var cmd = op;
    if (op !== 'CONNECT' && !name) {
        throw new Error(`No name given for ${op} command`);
    }
    switch (op) {
      case "SELECT":
        var items = x.substring(1).split("(")[1].split(")")[0];
        cmd += " " + items;
        var table = x.split("::")[1].split(" ")[0];
        cmd += " FROM " + table;
        var where = x.split("::")[1].split(" ").slice(1).join(" ");
        if (where)
            cmd += " WHERE " + parseWhere(where);
        break;
      case "DROP":
        var table = x.split("::")[1].split(" ")[0];
        cmd += " TABLE " + table;
        break;
      case "ALTER":
        var table = x.split("::")[1].split(" ")[0];
        cmd += " TABLE " + table;
        var items = x.substring(1).split("(")[1].split(")")[0];
        cmd += " " + items;
        break;
      case "CREATE":
        var table = x.split("::")[1].split(" ")[0];
        cmd += " TABLE " + table;
        var items = x.substring(1).split("(")[1].split(")")[0];
        cmd += " " + items;
        break;
      case "CONNECT":
        var pname = parsePath(x.split('@').slice(1).join('@'));
        db = await new Promise((res, rej) => {
          var d = new sqlite3.Database(pname, (err) => {
            if (err) rej(err);
            res(d);
          });
        });
        await new Promise((res) => db.serialize(res));
        break;
    }

    if (op !== 'CONNECT')
        cmds.push([name, cmd]);
  }

  var items = {};

  for (var x of cmds) {
    var name = x[0];
    x = x[1];
    var temps = /\[(.*)\]$/.exec(x);
    var resp = null;
    if (temps) {
      var temp = [];
      for (var x of temps[1].split(";").map((x) => x.trim()))
        temp += inferType(x);

      resp = await new Promise((res, rej) => {
        db.all(x.split("]")[0], temp, (err, rows) => {
          if (err) rej(err);
          else res(rows);
        });
      });
    } else {
      resp = await new Promise((res, rej) => {
        db.all(x, [], (err, rows) => {
          if (err) rej(err);
          else res(rows);
        });
      });
    }
    items[name] = resp;
  }

  return items;
}
