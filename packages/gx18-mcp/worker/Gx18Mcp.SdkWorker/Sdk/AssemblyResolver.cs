using System;
using System.IO;
using System.Reflection;

namespace Gx18Mcp.SdkWorker.Sdk
{
    public class AssemblyResolver
    {
        private readonly string _gx18Dir;

        public AssemblyResolver(string gx18Dir) { _gx18Dir = gx18Dir; }

        public void Register()
        {
            AppDomain.CurrentDomain.AssemblyResolve += OnAssemblyResolve;
        }

        private Assembly OnAssemblyResolve(object sender, ResolveEventArgs args)
        {
            var asmName = new AssemblyName(args.Name).Name;

            // *.XmlSerializers are OPTIONAL sgen-generated assemblies. The GX18 SDK probes for
            // "<Assembly>.XmlSerializers, Version=11.0.0.0" on first XML (de)serialization. They are
            // NOT shipped, so File.Exists fails and we used to return null AFTER logging — but the
            // failed probe also re-triggered resolution of the base assembly, producing an endless
            // "Loading: Artech.Genexus.Common / Artech.Architecture.Common" loop that stalled Open
            // until the SmartThreadPool ThreadAbort killed it. Short-circuit: never try to load a
            // serializers assembly; returning null here makes .NET fall back to the reflection-based
            // XmlSerializer (correct, just slightly slower), with no cascade.
            if (asmName.EndsWith(".XmlSerializers", StringComparison.OrdinalIgnoreCase))
                return null;

            // If this assembly is already loaded in the AppDomain, return the existing instance
            // instead of LoadFrom'ing a second copy. Re-loading spawned redundant resolves (the
            // visible loop) and can create duplicate identities that break the SDK's type checks.
            foreach (var loaded in AppDomain.CurrentDomain.GetAssemblies())
            {
                if (string.Equals(loaded.GetName().Name, asmName, StringComparison.OrdinalIgnoreCase))
                    return loaded;
            }

            var path = Path.Combine(_gx18Dir, asmName + ".dll");
            if (File.Exists(path))
            {
                Console.Error.WriteLine($"[gx18-worker] Loading: {asmName}");
                return Assembly.LoadFrom(path);
            }
            return null;
        }
    }
}
