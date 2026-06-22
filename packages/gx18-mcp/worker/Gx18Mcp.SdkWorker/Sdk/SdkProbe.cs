using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Gx18Mcp.SdkWorker.Sdk
{
    /// <summary>
    /// Read-only reflection probe over the GeneXus 18 SDK assemblies.
    /// Dumps the API surface needed to implement ObjectFactory write operations.
    /// Loading assemblies and enumerating types does NOT open the KB and creates zero revisions.
    /// </summary>
    public static class SdkProbe
    {
        public static object Run(string gx18Dir, string assemblyName, string typeName, string filter)
        {
            new AssemblyResolver(gx18Dir).Register();

            // Default: load the two core SDK assemblies and summarize
            if (string.IsNullOrEmpty(assemblyName))
                assemblyName = "Artech.Architecture.Common";

            Assembly asm;
            try { asm = Assembly.Load(assemblyName); }
            catch (Exception ex) { return new { error = $"Load failed: {assemblyName}: {ex.Message}" }; }

            // Mode 1: dump a specific type's members
            if (!string.IsNullOrEmpty(typeName))
            {
                var t = FindType(typeName);
                if (t == null) return new { error = $"Type not found: {typeName}" };
                if (t.IsEnum) return new { fullName = t.FullName, isEnum = true, values = Enum.GetNames(t).ToList() };
                return DumpType(t);
            }

            // Mode 1b: method search — filter starts with "method:" → scan all types for methods by name
            if (!string.IsNullOrEmpty(filter) && filter.StartsWith("method:"))
            {
                var mname = filter.Substring("method:".Length);
                var hits = new List<object>();
                Type[] allt;
                try { allt = asm.GetExportedTypes(); }
                catch (ReflectionTypeLoadException rtle) { allt = rtle.Types.Where(x => x != null).ToArray(); }
                foreach (var t in allt)
                {
                    MethodInfo[] ms;
                    try { ms = t.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly); }
                    catch { continue; }
                    foreach (var m in ms)
                        if (m.Name.IndexOf(mname, StringComparison.OrdinalIgnoreCase) >= 0)
                            hits.Add($"{(m.IsStatic ? "static " : "")}{t.FullName}.{m.Name}(" +
                                string.Join(", ", m.GetParameters().Select(pp => pp.ParameterType.Name + " " + pp.Name)) + ") : " + m.ReturnType.Name);
                }
                return new { methodSearch = mname, count = hits.Count, hits };
            }

            // Mode 2: list types in the assembly, optionally filtered by name substring
            var types = new List<object>();
            Type[] all;
            try { all = asm.GetExportedTypes(); }
            catch (ReflectionTypeLoadException rtle) { all = rtle.Types.Where(x => x != null).ToArray(); }

            foreach (var t in all.OrderBy(x => x.FullName))
            {
                if (!string.IsNullOrEmpty(filter) &&
                    t.FullName.IndexOf(filter, StringComparison.OrdinalIgnoreCase) < 0)
                    continue;
                types.Add(new { name = t.FullName, kind = t.IsInterface ? "interface" : t.IsAbstract ? "abstract" : t.IsEnum ? "enum" : "class" });
            }
            return new { assembly = asm.GetName().Name, version = asm.GetName().Version.ToString(), count = types.Count, types };
        }

        private static System.Collections.Generic.List<string> BaseChain(Type t)
        {
            var chain = new System.Collections.Generic.List<string>();
            var b = t.BaseType;
            while (b != null && b != typeof(object)) { chain.Add(b.Name); b = b.BaseType; }
            return chain;
        }

        private static Type FindType(string typeName)
        {
            // Search all currently loaded assemblies for the type by full name or simple name
            foreach (var a in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] ts;
                try { ts = a.GetTypes(); }
                catch (ReflectionTypeLoadException rtle) { ts = rtle.Types.Where(x => x != null).ToArray(); }
                catch { continue; }
                foreach (var t in ts)
                    if (t.FullName == typeName || t.Name == typeName) return t;
            }
            return null;
        }

        private static object DumpType(Type t)
        {
            var ctors = t.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
                .Select(c => "(" + string.Join(", ", c.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name)) + ")")
                .ToList();

            var methods = t.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Where(m => !m.IsSpecialName)
                .Select(m => $"{(m.IsStatic ? "static " : "")}{m.ReturnType.Name} {m.Name}(" +
                             string.Join(", ", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name)) + ")")
                .OrderBy(s => s)
                .ToList();

            var props = t.GetProperties(BindingFlags.Public | BindingFlags.Static | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                .Select(p => $"{p.PropertyType.Name} {p.Name} {{{(p.CanRead ? " get;" : "")}{(p.CanWrite ? " set;" : "")} }}")
                .OrderBy(s => s)
                .ToList();

            return new
            {
                fullName = t.FullName,
                assembly = t.Assembly.GetName().Name,
                baseType = t.BaseType?.FullName,
                baseChain = BaseChain(t),
                hasSourceProp = t.GetProperty("Source") != null,
                interfaces = t.GetInterfaces().Select(i => i.Name).ToList(),
                constructors = ctors,
                properties = props,
                methods = methods
            };
        }
    }
}
